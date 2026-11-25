import { assertEquals, assertExists } from "@std/assert";
import { id } from "@instantdb/admin";
import webpush from "web-push";
import {
  handleWebhookUpdate,
  type InternalMessage,
  msgToStr,
  type WebhookUpdate,
} from "../../protocol/src/clientApi.ts";
import {
  base64ToBase64Url,
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "../../protocol/src/crypto.ts";
import { resetSeenWebhookMessages } from "../../protocol/src/webhookAuth.ts";
import { canonicalStringForAuthSignV2 } from "./api.ts";
import { issueNonceHelper } from "./auth.ts";
import { query, transact, tx } from "./db.ts";
import { endpoints, setRequestWaitUntil } from "./main.ts";

const toBase64Url = (buf: ArrayBuffer) =>
  base64ToBase64Url(btoa(String.fromCharCode(...new Uint8Array(buf))));

const makeRealPushSubscriptionWithKeys = async (endpoint: string) => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const rawPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = toBase64Url(rawPublic.buffer);
  const auth = toBase64Url(authBytes.buffer);
  return {
    subscription: { endpoint, expirationTime: null, keys: { p256dh, auth } },
    privateKey: keyPair.privateKey,
    rawPublic,
    authBytes,
  };
};

const concatBytes = (...arrays: Uint8Array[]) => {
  const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  arrays.reduce((offset, a) => (out.set(a, offset), offset + a.length), 0);
  return out;
};

const hkdfSha256 = async (
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(ikm),
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(salt),
        info: new Uint8Array(info),
      },
      key,
      length * 8,
    ),
  );
};

const decryptWebPushPayload = async (
  body: Uint8Array,
  privateKey: CryptoKey,
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
): Promise<Record<string, unknown>> => {
  const salt = body.slice(0, 16);
  const idLen = body[20];
  const asPublicBytes = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const asPublic = await crypto.subtle.importKey(
    "raw",
    asPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: asPublic },
      privateKey,
      256,
    ),
  );
  const encoder = new TextEncoder();
  const ikm = await hkdfSha256(
    authSecret,
    sharedSecret,
    concatBytes(encoder.encode("WebPush: info\0"), uaPublic, asPublicBytes),
    32,
  );
  const cek = await hkdfSha256(
    salt,
    ikm,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdfSha256(
    salt,
    ikm,
    encoder.encode("Content-Encoding: nonce\0"),
    12,
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      ciphertext,
    ),
  );
  const delimiterIndex = plain.lastIndexOf(2);
  return JSON.parse(
    new TextDecoder().decode(plain.subarray(0, delimiterIndex)),
  );
};

const makeRealPushSubscription = async (endpoint: string) =>
  (await makeRealPushSubscriptionWithKeys(endpoint)).subscription;

type ReceivedPush = {
  path: string;
  urgency: string | null;
  ttl: string | null;
  bodyBytes: number;
};

const buildSignedSendMessageArgs = async ({
  conversation,
  encryptedMessage,
  publicSignKey,
  privateSignKey,
}: {
  conversation: string;
  encryptedMessage: string;
  publicSignKey: string;
  privateSignKey: string;
}) => {
  const nonce = await issueNonceHelper(publicSignKey);
  const authToken = await sign(
    privateSignKey,
    await canonicalStringForAuthSignV2({
      action: "sendMessage",
      payload: { conversation, encryptedMessage },
      publicSignKey,
      nonce,
    }),
  );
  return {
    conversation,
    encryptedMessage,
    senderPublicSignKey: publicSignKey,
    auth: { nonce, authToken },
  };
};

Deno.test(
  "sendPushToParticipants delivers high-urgency push to recently active recipient while skipping sender",
  async () => {
    const vapid = webpush.generateVAPIDKeys();
    Deno.env.set("VAPID_PUBLIC_KEY", vapid.publicKey);
    Deno.env.set("VAPID_PRIVATE_KEY", vapid.privateKey);
    Deno.env.set("ALLOW_LOCAL_WEBHOOKS", "1");

    const received: ReceivedPush[] = [];
    const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
      const url = new URL(req.url);
      const body = await req.arrayBuffer();
      received.push({
        path: url.pathname,
        urgency: req.headers.get("urgency"),
        ttl: req.headers.get("ttl"),
        bodyBytes: body.byteLength,
      });
      return new Response("", {
        status: url.pathname === "/stale" ? 410 : 201,
      });
    });

    const port = server.addr.port;
    const aliceId = id();
    const botId = id();
    const convoId = id();
    const aliceSubId = id();
    const aliceStaleSubId = id();
    const botSubId = id();
    const aliceKey = `test-alice-${aliceId}`;
    const botSign = await generateKeyPair("sign");
    const botKey = botSign.publicKey;

    const [aliceSub, aliceStaleSub, botSub] = await Promise.all([
      makeRealPushSubscription(`http://127.0.0.1:${port}/alice`),
      makeRealPushSubscription(`http://127.0.0.1:${port}/stale`),
      makeRealPushSubscription(`http://127.0.0.1:${port}/bot`),
    ]);

    await transact([
      tx.identities[aliceId].update({
        name: "Alice",
        publicSignKey: aliceKey,
        publicEncryptKey: "enc-alice",
        lastActiveAt: Date.now(),
      }),
      tx.identities[botId].update({
        name: "Arb Bot",
        publicSignKey: botKey,
        publicEncryptKey: "enc-bot",
        lastActiveAt: Date.now() - 120_000,
      }),
      tx.conversations[convoId]
        .update({ title: "Polymarket Chat", updatedAt: Date.now() })
        .link({ participants: [aliceId, botId] }),
      tx.pushSubscriptions[aliceSubId]
        .update({
          endpoint: aliceSub.endpoint,
          subscription: aliceSub,
          createdAt: Date.now(),
        })
        .link({ owner: aliceId }),
      tx.pushSubscriptions[aliceStaleSubId]
        .update({
          endpoint: aliceStaleSub.endpoint,
          subscription: aliceStaleSub,
          createdAt: Date.now(),
        })
        .link({ owner: aliceId }),
      tx.pushSubscriptions[botSubId]
        .update({
          endpoint: botSub.endpoint,
          subscription: botSub,
          createdAt: Date.now(),
        })
        .link({ owner: botId }),
    ]);

    const bgTasks: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgTasks.push(p));
    const { messageId } = await endpoints.handlers.sendMessage(
      await buildSignedSendMessageArgs({
        conversation: convoId,
        encryptedMessage: "test-ciphertext",
        publicSignKey: botKey,
        privateSignKey: botSign.privateKey,
      }),
    );
    await Promise.all(bgTasks);
    setRequestWaitUntil(undefined);

    const { pushSubscriptions: remainingStale } = await query({
      pushSubscriptions: { $: { where: { id: aliceStaleSubId } } },
    });

    await transact([
      tx.messages[messageId].delete(),
      tx.pushSubscriptions[aliceSubId].delete(),
      tx.pushSubscriptions[aliceStaleSubId].delete(),
      tx.pushSubscriptions[botSubId].delete(),
      tx.conversations[convoId].delete(),
      tx.identities[aliceId].delete(),
      tx.identities[botId].delete(),
    ]);
    await server.shutdown();
    Deno.env.delete("ALLOW_LOCAL_WEBHOOKS");

    const paths = received.map((r) => r.path).sort();
    assertEquals(paths, ["/alice", "/stale"]);
    const alicePush = received.find((r) => r.path === "/alice");
    assertEquals(alicePush?.urgency, "high");
    assertEquals(alicePush?.ttl, "86400");
    assertEquals((alicePush?.bodyBytes ?? 0) > 0, true);
    assertEquals(remainingStale.length, 0);
  },
);

const cloudflareEdgeSupportedRedirects = ["follow", "manual"];

const assertCloudflareEdgeRequestInit = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  const redirectMode = init?.redirect ??
    (input instanceof Request ? input.redirect : undefined);
  if (
    redirectMode !== undefined &&
    !cloudflareEdgeSupportedRedirects.includes(redirectMode)
  ) {
    throw new TypeError(
      'Invalid redirect value, must be one of "follow" or "manual" ("error" won\'t be implemented since it does not make sense at the edge; use "manual" and check the response status code).',
    );
  }
};

const withCloudflareEdgeFetchConstraints = async <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    assertCloudflareEdgeRequestInit(input, init);
    return origFetch(input, init);
  };
  return await fn().finally(() => {
    globalThis.fetch = origFetch;
  });
};

const makeEd25519KeyPairBase64 = async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]);
  const [pkcs8, spki] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
    crypto.subtle.exportKey("spki", pair.publicKey),
  ]);
  return {
    privateKey: btoa(String.fromCharCode(...new Uint8Array(pkcs8))),
    publicKey: btoa(String.fromCharCode(...new Uint8Array(spki))),
  };
};

Deno.test(
  "sendMessage delivers signed HTTP webhooks (including safe 307 redirects while blocking SSRF redirects) and Web Push under Cloudflare Workers fetch constraints",
  async () => {
    resetSeenWebhookMessages();
    const vapid = webpush.generateVAPIDKeys();
    const edKeys = await makeEd25519KeyPairBase64();
    Deno.env.set("VAPID_PUBLIC_KEY", vapid.publicKey);
    Deno.env.set("VAPID_PRIVATE_KEY", vapid.privateKey);
    Deno.env.set("WEBHOOK_SIGNING_PRIVATE_KEY", edKeys.privateKey);
    Deno.env.set("ALLOW_LOCAL_WEBHOOKS", "1");

    const receivedWebhooks: WebhookUpdate[] = [];
    const receivedPushes: string[] = [];

    const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
      const { pathname } = new URL(req.url);
      if (pathname === "/wh-redirect") {
        return new Response(null, {
          status: 307,
          headers: { location: "/wh-target" },
        });
      }
      if (pathname === "/wh-ssrf") {
        return new Response(null, {
          status: 307,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        });
      }
      if (pathname === "/wh-target") {
        receivedWebhooks.push(await req.json());
        return new Response("ok", { status: 200 });
      }
      if (pathname === "/push") {
        await req.arrayBuffer();
        receivedPushes.push(pathname);
        return new Response("", { status: 201 });
      }
      return new Response("not found", { status: 404 });
    });

    const port = server.addr.port;
    const [senderSign, senderEnc, botSign, botEnc, ssrfSign, ssrfEnc] =
      await Promise.all([
        generateKeyPair("sign"),
        generateKeyPair("encrypt"),
        generateKeyPair("sign"),
        generateKeyPair("encrypt"),
        generateKeyPair("sign"),
        generateKeyPair("encrypt"),
      ]);
    const senderId = id();
    const botId = id();
    const ssrfBotId = id();
    const convoId = id();
    const botKeyId = id();
    const ssrfKeyId = id();
    const pushSubId = id();
    const symKey = await generateSymmetricKey();
    const [botEncKey, ssrfEncKey, pushSub] = await Promise.all([
      encryptAsymmetric(botEnc.publicKey, symKey),
      encryptAsymmetric(ssrfEnc.publicKey, symKey),
      makeRealPushSubscription(`http://127.0.0.1:${port}/push`),
    ]);

    await transact([
      tx.identities[senderId].update({
        name: "Traveler",
        publicSignKey: senderSign.publicKey,
        publicEncryptKey: senderEnc.publicKey,
        lastActiveAt: Date.now(),
      }),
      tx.identities[botId].update({
        name: "GuideBot",
        publicSignKey: botSign.publicKey,
        publicEncryptKey: botEnc.publicKey,
        webhook: `http://127.0.0.1:${port}/wh-redirect`,
        lastActiveAt: Date.now(),
      }),
      tx.identities[ssrfBotId].update({
        name: "SsrfRedirectBot",
        publicSignKey: ssrfSign.publicKey,
        publicEncryptKey: ssrfEnc.publicKey,
        webhook: `http://127.0.0.1:${port}/wh-ssrf`,
        lastActiveAt: Date.now() - 120_000,
      }),
      tx.conversations[convoId]
        .update({ title: "Edge Chat", updatedAt: Date.now() })
        .link({ participants: [senderId, botId, ssrfBotId] }),
      tx.keys[botKeyId]
        .update({ key: botEncKey })
        .link({ owner: botId, conversation: convoId }),
      tx.keys[ssrfKeyId]
        .update({ key: ssrfEncKey })
        .link({ owner: ssrfBotId, conversation: convoId }),
      tx.pushSubscriptions[pushSubId]
        .update({
          endpoint: pushSub.endpoint,
          subscription: pushSub,
          createdAt: Date.now(),
        })
        .link({ owner: botId }),
    ]);

    const msgPayload: InternalMessage & {
      conversationId: string;
      sentAt: number;
    } = {
      type: "text",
      text: "hello from edge chat",
      conversationId: convoId,
      sentAt: Date.now(),
    };
    const encryptedMessage = await encryptSymmetric(symKey, {
      payload: msgPayload,
      publicSignKey: senderSign.publicKey,
      signature: await sign(senderSign.privateKey, msgToStr(msgPayload)),
    });

    const signedEdgeMsg = await buildSignedSendMessageArgs({
      conversation: convoId,
      encryptedMessage,
      publicSignKey: senderSign.publicKey,
      privateSignKey: senderSign.privateKey,
    });
    const bgTasks: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgTasks.push(p));
    const { messageId } = await withCloudflareEdgeFetchConstraints(async () => {
      const res = await endpoints.handlers.sendMessage(signedEdgeMsg);
      await Promise.all(bgTasks);
      return res;
    });
    setRequestWaitUntil(undefined);

    Deno.env.delete("WEBHOOK_SIGNING_PRIVATE_KEY");
    Deno.env.delete("ALLOW_LOCAL_WEBHOOKS");
    await transact([
      tx.messages[messageId].delete(),
      tx.pushSubscriptions[pushSubId].delete(),
      tx.keys[botKeyId].delete(),
      tx.keys[ssrfKeyId].delete(),
      tx.conversations[convoId].delete(),
      tx.identities[senderId].delete(),
      tx.identities[botId].delete(),
      tx.identities[ssrfBotId].delete(),
    ]);
    await server.shutdown();

    assertEquals(receivedWebhooks.length, 1);
    assertEquals(receivedPushes, ["/push"]);
    const decrypted = await handleWebhookUpdate(
      receivedWebhooks[0],
      {
        publicSignKey: botSign.publicKey,
        privateSignKey: botSign.privateKey,
        privateEncryptKey: botEnc.privateKey,
      },
      { webhookServerPublicKey: edKeys.publicKey },
    );
    assertExists(decrypted);
    assertEquals(
      decrypted.message.type === "text" ? decrypted.message.text : "",
      "hello from edge chat",
    );
  },
);

Deno.test(
  "Web Push includes E2EE preview keys and sender avatar under 3.5KB, omits oversized ciphertext, and auto-dismisses when recipient replies",
  async () => {
    const vapid = webpush.generateVAPIDKeys();
    Deno.env.set("VAPID_PUBLIC_KEY", vapid.publicKey);
    Deno.env.set("VAPID_PRIVATE_KEY", vapid.privateKey);
    Deno.env.set("ALLOW_LOCAL_WEBHOOKS", "1");

    const receivedBodies: Uint8Array[] = [];
    const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
      receivedBodies.push(new Uint8Array(await req.arrayBuffer()));
      return new Response("", { status: 201 });
    });

    const port = server.addr.port;
    const [aliceSign, aliceEnc, botSign, botEnc] = await Promise.all([
      generateKeyPair("sign"),
      generateKeyPair("encrypt"),
      generateKeyPair("sign"),
      generateKeyPair("encrypt"),
    ]);
    const aliceId = id();
    const botId = id();
    const convoId = id();
    const aliceKeyId = id();
    const aliceSubId = id();
    const symKey = await generateSymmetricKey();
    const [aliceEncKey, alicePush] = await Promise.all([
      encryptAsymmetric(aliceEnc.publicKey, symKey),
      makeRealPushSubscriptionWithKeys(`http://127.0.0.1:${port}/alice-phone`),
    ]);

    await transact([
      tx.identities[aliceId].update({
        name: "Alice",
        publicSignKey: aliceSign.publicKey,
        publicEncryptKey: aliceEnc.publicKey,
        lastActiveAt: Date.now(),
      }),
      tx.identities[botId].update({
        name: "Arb Bot",
        avatar: "https://aliceandbot.com/icon-192.png",
        publicSignKey: botSign.publicKey,
        publicEncryptKey: botEnc.publicKey,
        lastActiveAt: Date.now(),
      }),
      tx.conversations[convoId]
        .update({ title: "Alerts", updatedAt: Date.now() })
        .link({ participants: [aliceId, botId] }),
      tx.keys[aliceKeyId]
        .update({ key: aliceEncKey })
        .link({ owner: aliceId, conversation: convoId }),
      tx.pushSubscriptions[aliceSubId]
        .update({
          endpoint: alicePush.subscription.endpoint,
          subscription: alicePush.subscription,
          createdAt: Date.now(),
        })
        .link({ owner: aliceId }),
    ]);

    const shortPayload = {
      type: "text" as const,
      text: "Found opportunity at 42c",
      conversationId: convoId,
      sentAt: Date.now(),
    };
    const shortCiphertext = await encryptSymmetric(symKey, {
      payload: shortPayload,
      publicSignKey: botSign.publicKey,
      signature: await sign(botSign.privateKey, msgToStr(shortPayload)),
    });

    const bgTasks1: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgTasks1.push(p));
    const { messageId: msg1 } = await endpoints.handlers.sendMessage(
      await buildSignedSendMessageArgs({
        conversation: convoId,
        encryptedMessage: shortCiphertext,
        publicSignKey: botSign.publicKey,
        privateSignKey: botSign.privateKey,
      }),
    );
    await Promise.all(bgTasks1);

    const largeCiphertext = "x".repeat(4200);
    const bgTasks2: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgTasks2.push(p));
    const { messageId: msg2 } = await endpoints.handlers.sendMessage(
      await buildSignedSendMessageArgs({
        conversation: convoId,
        encryptedMessage: largeCiphertext,
        publicSignKey: botSign.publicKey,
        privateSignKey: botSign.privateKey,
      }),
    );
    await Promise.all(bgTasks2);

    const bgTasks3: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgTasks3.push(p));
    const { messageId: msg3 } = await endpoints.handlers.sendMessage(
      await buildSignedSendMessageArgs({
        conversation: convoId,
        encryptedMessage: shortCiphertext,
        publicSignKey: aliceSign.publicKey,
        privateSignKey: aliceSign.privateKey,
      }),
    );
    await Promise.all(bgTasks3);
    setRequestWaitUntil(undefined);

    const decryptedPayloads = await Promise.all(
      receivedBodies.map((b) =>
        decryptWebPushPayload(
          b,
          alicePush.privateKey,
          alicePush.rawPublic,
          alicePush.authBytes,
        )
      ),
    );

    await transact([
      tx.messages[msg1].delete(),
      tx.messages[msg2].delete(),
      tx.messages[msg3].delete(),
      tx.pushSubscriptions[aliceSubId].delete(),
      tx.keys[aliceKeyId].delete(),
      tx.conversations[convoId].delete(),
      tx.identities[aliceId].delete(),
      tx.identities[botId].delete(),
    ]);
    await server.shutdown();
    Deno.env.delete("ALLOW_LOCAL_WEBHOOKS");

    assertEquals(decryptedPayloads.length, 3);
    assertEquals(decryptedPayloads[0].type, "message");
    assertEquals(decryptedPayloads[0].messageId, msg1);
    assertEquals(decryptedPayloads[0].encryptedMessage, shortCiphertext);
    assertEquals(decryptedPayloads[0].conversationKey, aliceEncKey);
    assertEquals(decryptedPayloads[0].senderName, "Arb Bot");
    assertEquals(
      decryptedPayloads[0].senderAvatar,
      "https://aliceandbot.com/icon-192.png",
    );
    assertEquals(decryptedPayloads[0].senderPublicSignKey, botSign.publicKey);

    assertEquals(decryptedPayloads[1].type, "message");
    assertEquals(decryptedPayloads[1].messageId, msg2);
    assertEquals(decryptedPayloads[1].encryptedMessage, undefined);
    assertEquals(decryptedPayloads[1].conversationKey, aliceEncKey);

    assertEquals(decryptedPayloads[2].type, "dismiss");
    assertEquals(decryptedPayloads[2].conversationId, convoId);
  },
);

const buildSignedDismissArgs = async ({
  conversationId,
  excludeEndpoint,
  publicSignKey,
  privateSignKey,
}: {
  conversationId: string;
  excludeEndpoint: string;
  publicSignKey: string;
  privateSignKey: string;
}) => {
  const payload = { conversationId, excludeEndpoint };
  const nonce = await issueNonceHelper(publicSignKey);
  const authToken = await sign(
    privateSignKey,
    await canonicalStringForAuthSignV2({
      action: "dismissNotifications",
      payload,
      publicSignKey,
      nonce,
    }),
  );
  return { payload, publicSignKey, nonce, authToken };
};

Deno.test(
  "dismissNotifications sends cross-device dismiss push only to other notified devices and is idempotent",
  async () => {
    const vapid = webpush.generateVAPIDKeys();
    Deno.env.set("VAPID_PUBLIC_KEY", vapid.publicKey);
    Deno.env.set("VAPID_PRIVATE_KEY", vapid.privateKey);
    Deno.env.set("ALLOW_LOCAL_WEBHOOKS", "1");

    const receivedEvents: { path: string; body: Uint8Array }[] = [];
    const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
      const { pathname } = new URL(req.url);
      receivedEvents.push({
        path: pathname,
        body: new Uint8Array(await req.arrayBuffer()),
      });
      return new Response("", { status: 201 });
    });

    const port = server.addr.port;
    const [aliceSign, aliceEnc, botSign, botEnc] = await Promise.all([
      generateKeyPair("sign"),
      generateKeyPair("encrypt"),
      generateKeyPair("sign"),
      generateKeyPair("encrypt"),
    ]);
    const [phonePush, desktopPush] = await Promise.all([
      makeRealPushSubscriptionWithKeys(`http://127.0.0.1:${port}/phone`),
      makeRealPushSubscriptionWithKeys(`http://127.0.0.1:${port}/desktop`),
    ]);

    const aliceId = id();
    const botId = id();
    const convoId = id();
    const phoneSubId = id();
    const desktopSubId = id();

    await transact([
      tx.identities[aliceId].update({
        name: "Alice",
        publicSignKey: aliceSign.publicKey,
        publicEncryptKey: aliceEnc.publicKey,
      }),
      tx.identities[botId].update({
        name: "Bot",
        publicSignKey: botSign.publicKey,
        publicEncryptKey: botEnc.publicKey,
      }),
      tx.conversations[convoId]
        .update({ title: "Cross Device", updatedAt: Date.now() })
        .link({ participants: [aliceId, botId] }),
      tx.pushSubscriptions[phoneSubId]
        .update({
          endpoint: phonePush.subscription.endpoint,
          subscription: phonePush.subscription,
          createdAt: Date.now(),
        })
        .link({ owner: aliceId }),
      tx.pushSubscriptions[desktopSubId]
        .update({
          endpoint: desktopPush.subscription.endpoint,
          subscription: desktopPush.subscription,
          createdAt: Date.now(),
        })
        .link({ owner: aliceId }),
    ]);

    const bgSend: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgSend.push(p));
    const { messageId } = await endpoints.handlers.sendMessage(
      await buildSignedSendMessageArgs({
        conversation: convoId,
        encryptedMessage: "msg-cipher",
        publicSignKey: botSign.publicKey,
        privateSignKey: botSign.privateKey,
      }),
    );
    await Promise.all(bgSend);

    const bgDismiss1: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgDismiss1.push(p));
    await endpoints.handlers.dismissNotifications(
      await buildSignedDismissArgs({
        conversationId: convoId,
        excludeEndpoint: desktopPush.subscription.endpoint,
        publicSignKey: aliceSign.publicKey,
        privateSignKey: aliceSign.privateKey,
      }),
    );
    await Promise.all(bgDismiss1);

    const bgDismiss2: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgDismiss2.push(p));
    await endpoints.handlers.dismissNotifications(
      await buildSignedDismissArgs({
        conversationId: convoId,
        excludeEndpoint: desktopPush.subscription.endpoint,
        publicSignKey: aliceSign.publicKey,
        privateSignKey: aliceSign.privateKey,
      }),
    );
    await Promise.all(bgDismiss2);
    setRequestWaitUntil(undefined);

    const phonePushes = receivedEvents.filter((e) => e.path === "/phone");
    const desktopPushes = receivedEvents.filter((e) => e.path === "/desktop");
    const phonePayloads = await Promise.all(
      phonePushes.map((e) =>
        decryptWebPushPayload(
          e.body,
          phonePush.privateKey,
          phonePush.rawPublic,
          phonePush.authBytes,
        )
      ),
    );

    await transact([
      tx.messages[messageId].delete(),
      tx.pushSubscriptions[phoneSubId].delete(),
      tx.pushSubscriptions[desktopSubId].delete(),
      tx.conversations[convoId].delete(),
      tx.identities[aliceId].delete(),
      tx.identities[botId].delete(),
    ]);
    await server.shutdown();
    Deno.env.delete("ALLOW_LOCAL_WEBHOOKS");

    assertEquals(desktopPushes.length, 1);
    assertEquals(phonePayloads.length, 2);
    assertEquals(phonePayloads[0].type, "message");
    assertEquals(phonePayloads[1].type, "dismiss");
    assertEquals(phonePayloads[1].conversationId, convoId);
  },
);
