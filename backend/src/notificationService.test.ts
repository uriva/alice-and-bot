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
import { query, transact, tx } from "./db.ts";
import { endpoints, setRequestWaitUntil } from "./main.ts";

const toBase64Url = (buf: ArrayBuffer) =>
  base64ToBase64Url(btoa(String.fromCharCode(...new Uint8Array(buf))));

const makeRealPushSubscription = async (endpoint: string) => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const p256dh = toBase64Url(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  const auth = toBase64Url(authBytes.buffer);
  return { endpoint, expirationTime: null, keys: { p256dh, auth } };
};

type ReceivedPush = {
  path: string;
  urgency: string | null;
  ttl: string | null;
  bodyBytes: number;
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
    const botKey = `test-bot-${botId}`;

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
    const { messageId } = await endpoints.handlers.sendMessage({
      conversation: convoId,
      encryptedMessage: "test-ciphertext",
      senderPublicSignKey: botKey,
    });
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

    const bgTasks: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgTasks.push(p));
    const { messageId } = await withCloudflareEdgeFetchConstraints(async () => {
      const res = await endpoints.handlers.sendMessage({
        conversation: convoId,
        encryptedMessage,
        senderPublicSignKey: senderSign.publicKey,
      });
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
