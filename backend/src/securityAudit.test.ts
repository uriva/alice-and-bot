import { id, init as adminInit } from "@instantdb/admin";
import {
  assert,
  assertEquals,
  assertExists,
  assertFalse,
  assertMatch,
  assertRejects,
} from "@std/assert";
import rules from "../../instant.perms.ts";
import schema from "../../instant.schema.ts";
import {
  type Credentials,
  handleWebhookUpdate,
  instantAppId,
  type InternalMessage,
  msgToStr,
  type WebhookUpdate,
} from "../../protocol/src/clientApi.ts";
import {
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "../../protocol/src/crypto.ts";
import { instantEmailFromPublicSignKey } from "../../protocol/src/instantAuth.ts";
import { resetSeenWebhookMessages } from "../../protocol/src/webhookAuth.ts";
import {
  backendApiSchema,
  canonicalStringForAuthSign,
  canonicalStringForAuthSignV2,
} from "./api.ts";
import {
  getActiveNoncesCount,
  issueNonceHelper,
  MAX_NONCES,
  verifyAuthToken,
} from "./auth.ts";
import { auth, query, transact, tx } from "./db.ts";
import {
  endpoints,
  handleRequest,
  relayStoreMessage,
  setRequestWaitUntil,
} from "./main.ts";
import {
  buildSafeAttachmentPath,
  generateUploadUrl,
  sanitizeUploadContentType,
} from "./storage.ts";

const makeTestIdentity = async (
  name: string,
  extra?: { priceTag?: number; balance?: number },
) => {
  const signKp = await generateKeyPair("sign");
  const encKp = await generateKeyPair("encrypt");
  const identityId = id();
  const walletId = extra?.balance !== undefined ? id() : undefined;
  const creds: Credentials = {
    publicSignKey: signKp.publicKey,
    privateSignKey: signKp.privateKey,
    privateEncryptKey: encKp.privateKey,
  };
  await transact([
    tx.identities[identityId].update({
      name,
      publicSignKey: signKp.publicKey,
      publicEncryptKey: encKp.publicKey,
      ...(extra?.priceTag !== undefined ? { priceTag: extra.priceTag } : {}),
    }),
    ...(walletId !== undefined
      ? [
        tx.wallets[walletId]
          .update({ balance: extra?.balance ?? 0 })
          .link({ identity: identityId }),
      ]
      : []),
  ]);
  return {
    identityId,
    walletId,
    creds,
    publicEncryptKey: encKp.publicKey,
  };
};

const signAuthPayload = async <T>(
  creds: Credentials,
  action: string,
  payload: T,
) => {
  const nonce = await issueNonceHelper(creds.publicSignKey);
  const authToken = await sign(
    creds.privateSignKey,
    canonicalStringForAuthSign({
      action,
      publicSignKey: creds.publicSignKey,
      payload,
      nonce,
    }),
  );
  return {
    payload,
    publicSignKey: creds.publicSignKey,
    nonce,
    authToken,
  };
};

Deno.test("instant.perms.ts locks down sensitive entities, default attrs, writes, and identities.webhook field", () => {
  const permsRecord: Record<string, unknown> = rules;
  assertEquals(permsRecord.$default, { allow: { $default: "false" } });
  assertEquals(permsRecord.attrs, {
    allow: { $default: "false", create: "false" },
  });

  const lockedEntities = [
    "cryptoPayments",
    "wallets",
    "transactions",
    "accounts",
    "$users",
    "pushSubscriptions",
    "$files",
  ] as const;
  lockedEntities.forEach((entity) => {
    assertEquals(
      permsRecord[entity],
      {
        allow: {
          view: "false",
          create: "false",
          update: "false",
          delete: "false",
        },
      },
      `Expected ${entity} to be completely locked`,
    );
  });

  assertEquals(permsRecord.identities, {
    allow: {
      view: "true",
      create: "false",
      update: "false",
      delete: "false",
      link: {
        archivedConversations:
          "auth.email != null && auth.email == data.instantEmail",
      },
      unlink: {
        archivedConversations:
          "auth.email != null && auth.email == data.instantEmail",
      },
    },
    fields: {
      webhook: "false",
    },
  });

  assertEquals(permsRecord.conversations, {
    allow: {
      view:
        "auth.email != null && auth.email in data.ref('participants.instantEmail')",
      create: "false",
      update: "false",
      delete: "false",
    },
  });
  assertEquals(permsRecord.keys, {
    allow: {
      view:
        "auth.email != null && auth.email in data.ref('owner.instantEmail')",
      create: "false",
      update: "false",
      delete: "false",
    },
  });

  const participantScopedChatEntities = [
    "messages",
    "canvases",
    "typingStates",
    "uiElements",
  ] as const;
  participantScopedChatEntities.forEach((entity) => {
    assertEquals(
      permsRecord[entity],
      {
        allow: {
          view:
            "auth.email != null && auth.email in data.ref('conversation.participants.instantEmail')",
          create: "false",
          update: "false",
          delete: "false",
        },
      },
      `Expected ${entity} to restrict view to conversation participants`,
    );
  });
});

Deno.test("[CRITICAL-02] requestPayout and prepareCryptoPayment schemas and handlers reject non-positive or non-finite amounts", async () => {
  const badAmounts = [0, -1, -1000, Number.NaN, Number.POSITIVE_INFINITY];
  badAmounts.forEach((amount) => {
    assertEquals(
      backendApiSchema.requestPayout.input.safeParse({
        payload: { amount, walletAddress: "bc1qtest" },
        publicSignKey: "pk",
        nonce: "n",
        authToken: "sig",
      }).success,
      false,
    );
    assertEquals(
      backendApiSchema.prepareCryptoPayment.input.safeParse({
        payload: { amount },
        publicSignKey: "pk",
        nonce: "n",
        authToken: "sig",
      }).success,
      false,
    );
  });

  const user = await makeTestIdentity("PayoutNegative", { balance: 100 });
  const signedNegative = await signAuthPayload(user.creds, "requestPayout", {
    amount: -500,
    walletAddress: "bc1qattacker",
  });
  await assertRejects(() => endpoints.handlers.requestPayout(signedNegative));

  const { wallets } = await query({
    wallets: { $: { where: { id: user.walletId! } } },
  });
  assertEquals(wallets[0]?.balance, 100);

  await transact([
    tx.wallets[user.walletId!].delete(),
    tx.identities[user.identityId].delete(),
  ]);
});

Deno.test("[CRITICAL-02] concurrent requestPayout calls are serialized per identity to prevent double-spend", async () => {
  const user = await makeTestIdentity("PayoutRace", { balance: 500 });
  const [req1, req2] = await Promise.all([
    signAuthPayload(user.creds, "requestPayout", {
      amount: 500,
      walletAddress: "bc1qrace1",
    }),
    signAuthPayload(user.creds, "requestPayout", {
      amount: 500,
      walletAddress: "bc1qrace2",
    }),
  ]);

  const [res1, res2] = await Promise.all([
    endpoints.handlers.requestPayout(req1),
    endpoints.handlers.requestPayout(req2),
  ]);

  const successes = [res1, res2].filter((r) => r.success).length;
  assertEquals(
    successes,
    1,
    "Only one concurrent full-balance payout may succeed",
  );

  const { identities } = await query({
    identities: {
      wallet: {},
      sentTransactions: {},
      $: { where: { id: user.identityId } },
    },
  });
  assertEquals(identities[0]?.wallet?.balance, 0);

  const txDeletes = (identities[0]?.sentTransactions ?? []).map(
    (t: { id: string }) => tx.transactions[t.id].delete(),
  );
  await transact([
    ...txDeletes,
    tx.wallets[user.walletId!].delete(),
    tx.identities[user.identityId].delete(),
  ]);
});

Deno.test("[MEDIUM-03] createConversation does NOT waive priceTag when sender and recipient only share a group chat", async () => {
  const sender = await makeTestIdentity("GroupBypassSender", { balance: 0 });
  const paidRecipient = await makeTestIdentity("PaidVIP", { priceTag: 250 });
  const bystander = await makeTestIdentity("Bystander");
  const groupConvoId = id();

  await transact(
    tx.conversations[groupConvoId]
      .update({ title: "Public Group", updatedAt: Date.now() })
      .link({
        participants: [
          sender.identityId,
          paidRecipient.identityId,
          bystander.identityId,
        ],
      }),
  );

  const symKey = await generateSymmetricKey();
  const keyMap = {
    [sender.creds.publicSignKey]: await encryptAsymmetric(
      sender.publicEncryptKey,
      symKey,
    ),
    [paidRecipient.creds.publicSignKey]: await encryptAsymmetric(
      paidRecipient.publicEncryptKey,
      symKey,
    ),
  };

  const signedCreate = await signAuthPayload(
    sender.creds,
    "createConversation",
    {
      title: "1:1 DM Attempt",
      publicSignKeyToEncryptedSymmetricKey: keyMap,
    },
  );
  const res = await endpoints.handlers.createConversation(signedCreate);
  assertEquals(res, { error: "insufficient-balance" });

  await transact([
    tx.conversations[groupConvoId].delete(),
    tx.wallets[sender.walletId!].delete(),
    tx.identities[sender.identityId].delete(),
    tx.identities[paidRecipient.identityId].delete(),
    tx.identities[bystander.identityId].delete(),
  ]);
});

Deno.test("[CRITICAL-03] setWebhook blocks SSRF URLs and prevents unauthenticated hijack while preserving legacy first-time registration", async () => {
  const bot = await makeTestIdentity("WebhookBot");

  const ssrfUrls = [
    "http://169.254.169.254/latest/meta-data/",
    "https://169.254.169.254/latest/meta-data/",
    "https://127.0.0.1/webhook",
    "https://localhost/webhook",
    "https://10.0.0.1/webhook",
    "https://172.16.5.4/webhook",
    "https://192.168.1.10/webhook",
    "https://100.64.0.1/webhook",
    "https://[::1]/webhook",
    "https://[fe80::1]/webhook",
    "https://[::ffff:169.254.169.254]/webhook",
    "http://example.com/webhook",
  ];

  await Promise.all(
    ssrfUrls.map(async (badUrl) => {
      const res = await endpoints.handlers.setWebhook({
        url: badUrl,
        publicSignKey: bot.creds.publicSignKey,
      });
      assertEquals(
        res.success,
        false,
        `Expected SSRF URL ${badUrl} to be rejected`,
      );
    }),
  );

  const initialUrl = "https://legit-bot.example.com/webhook";
  const firstSet = await endpoints.handlers.setWebhook({
    url: initialUrl,
    publicSignKey: bot.creds.publicSignKey,
  });
  assertEquals(firstSet, { success: true });

  const idempotentSet = await endpoints.handlers.setWebhook({
    url: initialUrl,
    publicSignKey: bot.creds.publicSignKey,
  });
  assertEquals(idempotentSet, { success: true });

  const unauthHijack = await endpoints.handlers.setWebhook({
    url: "https://attacker.example.com/steal",
    publicSignKey: bot.creds.publicSignKey,
  });
  assertEquals(unauthHijack.success, false);

  const unauthClear = await endpoints.handlers.setWebhook({
    url: "",
    publicSignKey: bot.creds.publicSignKey,
  });
  assertEquals(unauthClear.success, false);

  const rotatedUrl = "https://legit-bot-v2.example.com/webhook";
  const signedRotate = await signAuthPayload(bot.creds, "setWebhook", {
    url: rotatedUrl,
  });
  const authedUpdate = await endpoints.handlers.setWebhook({
    url: rotatedUrl,
    publicSignKey: bot.creds.publicSignKey,
    auth: {
      nonce: signedRotate.nonce,
      authToken: signedRotate.authToken,
    },
  });
  assertEquals(authedUpdate, { success: true });

  const signedClear = await signAuthPayload(bot.creds, "setWebhook", {
    url: "",
  });
  const authedClear = await endpoints.handlers.setWebhook({
    url: "",
    publicSignKey: bot.creds.publicSignKey,
    auth: {
      nonce: signedClear.nonce,
      authToken: signedClear.authToken,
    },
  });
  assertEquals(authedClear, { success: true });

  await transact(tx.identities[bot.identityId].delete());
});

Deno.test("[CRITICAL-03] registerPushSubscription rejects private and non-HTTPS endpoints", async () => {
  const user = await makeTestIdentity("PushUser");
  const badSub = {
    subscription: {
      endpoint: "http://169.254.169.254/push",
      expirationTime: null,
      keys: { p256dh: "k1", auth: "k2" },
    },
  };
  const signed = await signAuthPayload(
    user.creds,
    "registerPushSubscription",
    badSub,
  );
  await assertRejects(() =>
    endpoints.handlers.registerPushSubscription(signed)
  );
  await transact(tx.identities[user.identityId].delete());
});

Deno.test("[HIGH-03] sendMessage rejects non-participants and handleWebhookUpdate rejects non-participant signatures", async () => {
  const alice = await makeTestIdentity("Alice");
  const bob = await makeTestIdentity("Bob");
  const outsider = await makeTestIdentity("Outsider");
  const convoId = id();

  await transact(
    tx.conversations[convoId]
      .update({ title: "Private Chat", updatedAt: Date.now() })
      .link({ participants: [alice.identityId, bob.identityId] }),
  );

  await assertRejects(() =>
    endpoints.handlers.sendMessage({
      conversation: convoId,
      encryptedMessage: "ciphertext",
      senderPublicSignKey: outsider.creds.publicSignKey,
    })
  );

  const symKey = await generateSymmetricKey();
  const encKey = await encryptAsymmetric(alice.publicEncryptKey, symKey);
  const forgedMsg = { type: "text" as const, text: "Forged by outsider" };
  const forgedCipher = await encryptSymmetric(symKey, {
    payload: forgedMsg,
    publicSignKey: outsider.creds.publicSignKey,
    signature: await sign(outsider.creds.privateSignKey, msgToStr(forgedMsg)),
  });

  const whResult = await handleWebhookUpdate(
    {
      conversationId: convoId,
      messageId: "m-forged",
      timestamp: Date.now(),
      payload: forgedCipher,
      conversationKey: encKey,
      conversationInfo: {
        participants: [
          { publicSignKey: alice.creds.publicSignKey, name: "Alice" },
          { publicSignKey: bob.creds.publicSignKey, name: "Bob" },
        ],
        isPartial: false,
        hasCanvas: false,
      },
    },
    alice.creds,
  );
  assertEquals(whResult, undefined);

  await endpoints.handlers.sendTyping({
    conversation: convoId,
    isTyping: true,
    publicSignKey: outsider.creds.publicSignKey,
  });
  const { typingStates: outsiderTyping } = await query({
    typingStates: {
      $: {
        where: {
          "owner.publicSignKey": outsider.creds.publicSignKey,
          conversation: convoId,
        },
      },
    },
  });
  assertEquals(outsiderTyping.length, 0);

  const crossConvMsg = {
    type: "text" as const,
    text: "Message bound to other conversation",
    conversationId: "different-conversation-id",
    sentAt: Date.now(),
  };
  const crossConvCipher = await encryptSymmetric(symKey, {
    payload: crossConvMsg,
    publicSignKey: bob.creds.publicSignKey,
    signature: await sign(bob.creds.privateSignKey, msgToStr(crossConvMsg)),
  });
  const replayedResult = await handleWebhookUpdate(
    {
      conversationId: convoId,
      messageId: "m-replayed",
      timestamp: Date.now(),
      payload: crossConvCipher,
      conversationKey: encKey,
      conversationInfo: {
        participants: [
          { publicSignKey: alice.creds.publicSignKey, name: "Alice" },
          { publicSignKey: bob.creds.publicSignKey, name: "Bob" },
        ],
        isPartial: false,
        hasCanvas: false,
      },
    },
    alice.creds,
  );
  assertEquals(replayedResult, undefined);

  await transact([
    tx.conversations[convoId].delete(),
    tx.identities[alice.identityId].delete(),
    tx.identities[bob.identityId].delete(),
    tx.identities[outsider.identityId].delete(),
  ]);
});

Deno.test("[MEDIUM-04] renameConversation rejects non-admin participant when admins exist", async () => {
  const admin = await makeTestIdentity("AdminUser");
  const member = await makeTestIdentity("RegularMember");
  const convoId = id();

  await transact(
    tx.conversations[convoId]
      .update({ title: "Original Title", updatedAt: Date.now() })
      .link({
        participants: [admin.identityId, member.identityId],
        admins: [admin.identityId],
      }),
  );

  const memberAttempt = await signAuthPayload(
    member.creds,
    "renameConversation",
    { conversationId: convoId, title: "Hijacked Title" },
  );
  const memberRes = await endpoints.handlers.renameConversation(memberAttempt);
  assertEquals(memberRes, { success: false, error: "not-admin" });

  const adminAttempt = await signAuthPayload(
    admin.creds,
    "renameConversation",
    { conversationId: convoId, title: "Approved Title" },
  );
  const adminRes = await endpoints.handlers.renameConversation(adminAttempt);
  assertEquals(adminRes, { success: true });

  await transact([
    tx.conversations[convoId].delete(),
    tx.identities[admin.identityId].delete(),
    tx.identities[member.identityId].delete(),
  ]);
});

Deno.test("[HIGH-02] & [HIGH-08] external POST /relay/webhook/:token is blocked and /ui-update enforces text length and auth", async () => {
  const token = crypto.randomUUID();
  const spoofRes = await handleRequest(
    new Request(`http://localhost/relay/webhook/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "c1",
        messageId: "m1",
        payload: "x",
      }),
    }),
  );
  assertEquals(spoofRes.status, 403);

  const pollRes = await handleRequest(
    new Request(`http://localhost/relay/poll/${token}`, { method: "GET" }),
  );
  const pollBody = await pollRes.json();
  assertEquals(pollBody, { messages: [] });

  const oversizedUi = await handleRequest(
    new Request("http://localhost/ui-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        elementId: "el-1",
        conversationId: "c-1",
        type: "stream",
        text: "x".repeat(40_000),
      }),
    }),
  );
  const oversizedJson = await oversizedUi.json();
  assert("error" in oversizedJson);

  const forgedAuthUi = await handleRequest(
    new Request("http://localhost/ui-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        elementId: "el-2",
        conversationId: "c-1",
        type: "stream",
        text: "hi",
        auth: {
          publicSignKey: "forged-key",
          nonce: "forged-nonce",
          authToken: "forged-sig",
        },
      }),
    }),
  );
  assertEquals(forgedAuthUi.status, 401);
});

Deno.test("[HIGH-04] generateUploadUrl rejects traversal in contentHash/ext and neutralizes scriptable contentTypes", async () => {
  await assertRejects(
    () =>
      generateUploadUrl({
        conversationId: "convo-1",
        contentHash: "../../widget/dist/widget.iife",
        fileName: "evil.js",
        contentType: "application/octet-stream",
      }),
    Error,
    "Invalid contentHash",
  );

  await assertRejects(
    () =>
      generateUploadUrl({
        conversationId: "convo-1",
        contentHash: "a".repeat(64),
        fileName: "evil.a/../../b",
        contentType: "application/octet-stream",
      }),
    Error,
    "Invalid file extension",
  );

  assertEquals(
    buildSafeAttachmentPath({
      conversationId: "convo-1",
      contentHash: "A".repeat(64),
      fileName: "photo.PNG",
    }),
    `attachments/convo-1/${"a".repeat(64)}.png`,
  );

  [
    "text/html",
    "text/html; charset=utf-8",
    "application/xhtml+xml",
    "image/svg+xml",
    "text/javascript",
    "application/javascript",
    "text/xml",
  ].forEach((dangerous) => {
    assertEquals(
      sanitizeUploadContentType(dangerous),
      "application/octet-stream",
    );
  });
  assertEquals(sanitizeUploadContentType("image/png"), "image/png");
});

Deno.test("scripts/buildWorker.ts has no sequential UUID or Math.random crypto fallbacks", async () => {
  const code = await Deno.readTextFile("./scripts/buildWorker.ts");
  assertFalse(code.includes("00000000-0000-4000-8000-"));
  assertFalse(code.includes("Math.random()"));
});

Deno.test("[HIGH-06] & [MEDIUM-02] verifyAuthToken supports V2 64-hex SHA-256 and V1 fallback, prevents replay, and bounds nonces Map", async () => {
  const kp = await generateKeyPair("sign");
  const payload = { alias: "alice" };

  const nonceV2 = await issueNonceHelper(kp.publicKey);
  const digestV2 = await canonicalStringForAuthSignV2({
    action: "setAlias",
    publicSignKey: kp.publicKey,
    payload,
    nonce: nonceV2,
  });
  assertMatch(digestV2, /^[0-9a-f]{64}$/);
  const sigV2 = await sign(kp.privateKey, digestV2);
  assertEquals(
    await verifyAuthToken({
      action: "setAlias",
      publicSignKey: kp.publicKey,
      payload,
      nonce: nonceV2,
      authToken: sigV2,
    }),
    true,
  );
  assertEquals(
    await verifyAuthToken({
      action: "setAlias",
      publicSignKey: kp.publicKey,
      payload,
      nonce: nonceV2,
      authToken: sigV2,
    }),
    false,
  );

  const nonceV1 = await issueNonceHelper(kp.publicKey);
  const sigV1 = await sign(
    kp.privateKey,
    canonicalStringForAuthSign({
      action: "setAlias",
      publicSignKey: kp.publicKey,
      payload,
      nonce: nonceV1,
    }),
  );
  assertEquals(
    await verifyAuthToken({
      action: "setAlias",
      publicSignKey: kp.publicKey,
      payload,
      nonce: nonceV1,
      authToken: sigV1,
    }),
    true,
  );

  await Promise.all(
    Array.from(
      { length: MAX_NONCES + 50 },
      (_, idx) => issueNonceHelper(`flood-pk-${idx}`),
    ),
  );
  assert(getActiveNoncesCount() <= MAX_NONCES);
});

Deno.test("[CRITICAL-06] & [HIGH-02] storeTransferPayload and relayStoreMessage enforce size and queue bounds", async () => {
  await assertRejects(
    () =>
      endpoints.handlers.storeTransferPayload({
        encryptedPayload: "x".repeat(32_769),
      }),
    Error,
    "Transfer payload exceeds maximum size",
  );

  const first = await endpoints.handlers.storeTransferPayload({
    encryptedPayload: "first-entry",
  });
  await Promise.all(
    Array.from(
      { length: 1_005 },
      (_, i) =>
        endpoints.handlers.storeTransferPayload({
          encryptedPayload: `entry-${i}`,
        }),
    ),
  );
  const evicted = await endpoints.handlers.retrieveTransferPayload({
    relayId: first.relayId,
  });
  assertEquals(evicted, { error: "not-found" });

  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        relayStoreMessage("tok-big", "y".repeat(300_000))
      ),
    Error,
    "Relay message exceeds maximum size",
  );
});

const exportBytesBase64 = (buffer: ArrayBuffer): string =>
  btoa(
    Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(""),
  );

const makeEd25519SigningPair = async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  );
  if (!("publicKey" in kp)) {
    throw new Error("Expected Ed25519 keypair");
  }
  return {
    publicKey: exportBytesBase64(
      await crypto.subtle.exportKey("spki", kp.publicKey),
    ),
    privateKey: exportBytesBase64(
      await crypto.subtle.exportKey("pkcs8", kp.privateKey),
    ),
  };
};

Deno.test("callWebhooks signs HTTP and local-relay webhook updates with Ed25519 origin signature and headers", async () => {
  resetSeenWebhookMessages();
  const edKeys = await makeEd25519SigningPair();
  Deno.env.set("WEBHOOK_SIGNING_PRIVATE_KEY", edKeys.privateKey);
  Deno.env.set("ALLOW_LOCAL_WEBHOOKS", "1");

  const receivedHttp: {
    headers: Record<string, string | null>;
    body: WebhookUpdate;
  }[] = [];
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const body: WebhookUpdate = await req.json();
    receivedHttp.push({
      headers: {
        timestamp: req.headers.get("x-alice-timestamp"),
        messageId: req.headers.get("x-alice-message-id"),
        signature: req.headers.get("x-alice-signature"),
      },
      body,
    });
    return new Response("ok", { status: 200 });
  });

  const sender = await makeTestIdentity("WebhookOriginSender");
  const httpBot = await makeTestIdentity("HttpSignedBot");
  const relayBot = await makeTestIdentity("RelaySignedBot");
  const convoId = id();
  const symKey = await generateSymmetricKey();
  const httpKeyId = id();
  const relayKeyId = id();
  const relayToken = crypto.randomUUID();

  const [httpEncKey, relayEncKey] = await Promise.all([
    encryptAsymmetric(httpBot.publicEncryptKey, symKey),
    encryptAsymmetric(relayBot.publicEncryptKey, symKey),
  ]);

  await transact([
    tx.identities[httpBot.identityId].update({
      webhook: `http://127.0.0.1:${server.addr.port}/wh`,
    }),
    tx.identities[relayBot.identityId].update({
      webhook: `https://api.aliceandbot.com/relay/webhook/${relayToken}`,
    }),
    tx.conversations[convoId]
      .update({ title: "Signed Webhook Convo", updatedAt: Date.now() })
      .link({
        participants: [
          sender.identityId,
          httpBot.identityId,
          relayBot.identityId,
        ],
      }),
    tx.keys[httpKeyId]
      .update({ key: httpEncKey })
      .link({ owner: httpBot.identityId, conversation: convoId }),
    tx.keys[relayKeyId]
      .update({ key: relayEncKey })
      .link({ owner: relayBot.identityId, conversation: convoId }),
  ]);

  const msgPayload: InternalMessage & {
    conversationId: string;
    sentAt: number;
  } = {
    type: "text",
    text: "verified server origin",
    conversationId: convoId,
    sentAt: Date.now(),
  };
  const encryptedMessage = await encryptSymmetric(symKey, {
    payload: msgPayload,
    publicSignKey: sender.creds.publicSignKey,
    signature: await sign(sender.creds.privateSignKey, msgToStr(msgPayload)),
  });

  const bgTasks: Promise<unknown>[] = [];
  setRequestWaitUntil((p) => bgTasks.push(p));
  const { messageId } = await endpoints.handlers.sendMessage({
    conversation: convoId,
    encryptedMessage,
    senderPublicSignKey: sender.creds.publicSignKey,
    silent: true,
  });
  await Promise.all(bgTasks);
  setRequestWaitUntil(undefined);

  const pollRes = await handleRequest(
    new Request(`http://localhost/relay/poll/${relayToken}`, { method: "GET" }),
  );
  const pollJson: { messages: WebhookUpdate[] } = await pollRes.json();

  Deno.env.delete("WEBHOOK_SIGNING_PRIVATE_KEY");
  Deno.env.delete("ALLOW_LOCAL_WEBHOOKS");
  await server.shutdown();

  await transact([
    tx.messages[messageId].delete(),
    tx.keys[httpKeyId].delete(),
    tx.keys[relayKeyId].delete(),
    tx.conversations[convoId].delete(),
    tx.identities[sender.identityId].delete(),
    tx.identities[httpBot.identityId].delete(),
    tx.identities[relayBot.identityId].delete(),
  ]);

  assertEquals(receivedHttp.length, 1);
  assertEquals(receivedHttp[0].headers.messageId, messageId);
  assertExists(receivedHttp[0].headers.timestamp);
  assertExists(receivedHttp[0].headers.signature);
  assertEquals(
    receivedHttp[0].body.serverSignature,
    receivedHttp[0].headers.signature,
  );

  const verifiedHttp = await handleWebhookUpdate(
    receivedHttp[0].body,
    httpBot.creds,
    {
      requireServerSignature: true,
      webhookServerPublicKey: edKeys.publicKey,
    },
  );
  assertExists(verifiedHttp);
  assertEquals(verifiedHttp.message.text, "verified server origin");

  assertEquals(pollJson.messages.length, 1);
  assertExists(pollJson.messages[0].serverSignature);
  const verifiedRelay = await handleWebhookUpdate(
    pollJson.messages[0],
    relayBot.creds,
    {
      requireServerSignature: true,
      webhookServerPublicKey: edKeys.publicKey,
    },
  );
  assertExists(verifiedRelay);
  assertEquals(verifiedRelay.message.text, "verified server origin");
});

Deno.test("mintInstantToken verifies auth, backfills instantEmail on legacy identities, and mints a working InstantDB user token", async () => {
  const legacyUser = await makeTestIdentity("LegacyNoInstantEmail");
  const anonSign = await generateKeyPair("sign");
  const anonEnc = await generateKeyPair("encrypt");
  await endpoints.handlers.createAnonymousIdentity({
    name: "FreshAnonWithInstantEmail",
    publicSignKey: anonSign.publicKey,
    publicEncryptKey: anonEnc.publicKey,
  });

  const expectedAnonEmail = await instantEmailFromPublicSignKey(
    anonSign.publicKey,
  );
  const { identities: anonRows } = await query({
    identities: { $: { where: { publicSignKey: anonSign.publicKey } } },
  });
  assertExists(anonRows[0]);
  if (anonRows[0].instantEmail !== undefined) {
    assertEquals(anonRows[0].instantEmail, expectedAnonEmail);
  }

  const badSigRes = await endpoints.handlers.mintInstantToken({
    payload: {},
    publicSignKey: legacyUser.creds.publicSignKey,
    nonce: "bad-nonce",
    authToken: "bad-sig",
  });
  assertEquals(badSigRes, { error: "invalid-auth" });

  const ghostSign = await generateKeyPair("sign");
  const ghostEnc = await generateKeyPair("encrypt");
  const ghostSigned = await signAuthPayload(
    {
      publicSignKey: ghostSign.publicKey,
      privateSignKey: ghostSign.privateKey,
      privateEncryptKey: ghostEnc.privateKey,
    },
    "mintInstantToken",
    {},
  );
  const notFoundRes = await endpoints.handlers.mintInstantToken(ghostSigned);
  assertEquals(notFoundRes, { error: "not-found" });

  const validSigned = await signAuthPayload(
    legacyUser.creds,
    "mintInstantToken",
    {},
  );
  const expectedLegacyEmail = await instantEmailFromPublicSignKey(
    legacyUser.creds.publicSignKey,
  );
  const transactBodies: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    if (url.includes("/admin/transact") && typeof init?.body === "string") {
      transactBodies.push(init.body);
    }
    return origFetch(input, init);
  };
  const minted = await endpoints.handlers.mintInstantToken(validSigned).finally(
    () => {
      globalThis.fetch = origFetch;
    },
  );
  assert("token" in minted);
  assertEquals(minted.instantEmail, expectedLegacyEmail);
  assert(
    transactBodies.some(
      (b) =>
        b.includes(legacyUser.identityId) &&
        b.includes("instantEmail") &&
        b.includes(expectedLegacyEmail),
    ),
    "Expected mintInstantToken to transact instantEmail backfill onto identity",
  );

  const { identities: updatedLegacy } = await query({
    identities: { $: { where: { id: legacyUser.identityId } } },
  });
  if (updatedLegacy[0]?.instantEmail !== undefined) {
    assertEquals(updatedLegacy[0].instantEmail, expectedLegacyEmail);
  }

  const verifiedUser = await auth.verifyToken(minted.token);
  assertEquals(verifiedUser.email, expectedLegacyEmail);

  const userScopedDb = adminInit({ appId: instantAppId, schema }).asUser({
    token: minted.token,
  });
  const scopedResult = await userScopedDb.query({
    identities: { $: { where: { id: legacyUser.identityId } } },
  });
  assertEquals(scopedResult.identities[0]?.id, legacyUser.identityId);

  const { $users } = await query({
    $users: { $: { where: { email: expectedLegacyEmail } } },
  });
  await transact([
    ...$users.map((u: { id: string }) => tx.$users[u.id].delete()),
    tx.identities[legacyUser.identityId].delete(),
    ...(anonRows[0] ? [tx.identities[anonRows[0].id].delete()] : []),
  ]);
});

Deno.test("getConversations, getConversationInfo, conversationKey, and getCanvasRow enforce participant auth and ENFORCE_STRICT_METADATA_AUTH", async () => {
  const alice = await makeTestIdentity("MetaAlice");
  const bob = await makeTestIdentity("MetaBob");
  const outsider = await makeTestIdentity("MetaOutsider");
  const convoId = id();
  const aliceKeyId = id();
  const symKey = await generateSymmetricKey();
  const aliceEncKey = await encryptAsymmetric(alice.publicEncryptKey, symKey);

  await transact([
    tx.conversations[convoId]
      .update({ title: "Protected Metadata Chat", updatedAt: Date.now() })
      .link({ participants: [alice.identityId, bob.identityId] }),
    tx.keys[aliceKeyId]
      .update({ key: aliceEncKey })
      .link({ owner: alice.identityId, conversation: convoId }),
  ]);

  const encryptedCanvas = await encryptSymmetric(
    symKey,
    "view = () => div([])",
  );
  const saveCanvasReq = await signAuthPayload(alice.creds, "saveCanvas", {
    conversationId: convoId,
    encrypted: encryptedCanvas,
    expectedVersion: 0,
  });
  const savedCanvas = await endpoints.handlers.saveCanvas(saveCanvasReq);
  assertEquals(savedCanvas, { ok: true, version: 1 });

  Deno.env.set("ENFORCE_STRICT_METADATA_AUTH", "0");
  const pairKeys = [alice.creds.publicSignKey, bob.creds.publicSignKey];

  const legacyConvos = await endpoints.handlers.getConversations({
    publicSignKeys: pairKeys,
  });
  assertEquals(
    legacyConvos.conversations.some((c) => c.id === convoId),
    true,
  );
  const legacyInfo = await endpoints.handlers.getConversationInfo({
    conversationId: convoId,
  });
  assert("conversationInfo" in legacyInfo);
  const legacyKey = await endpoints.handlers.conversationKey({
    conversationId: convoId,
    publicSignKey: alice.creds.publicSignKey,
  });
  assertEquals(legacyKey, { conversationKey: aliceEncKey });
  const legacyCanvas = await endpoints.handlers.getCanvasRow({
    conversationId: convoId,
  });
  assertExists(legacyCanvas.row);

  const outsiderConvosSigned = await signAuthPayload(
    outsider.creds,
    "getConversations",
    { publicSignKeys: pairKeys },
  );
  assertEquals(
    await endpoints.handlers.getConversations({
      publicSignKeys: pairKeys,
      auth: {
        publicSignKey: outsider.creds.publicSignKey,
        nonce: outsiderConvosSigned.nonce,
        authToken: outsiderConvosSigned.authToken,
      },
    }),
    { conversations: [] },
  );

  const outsiderInfoSigned = await signAuthPayload(
    outsider.creds,
    "getConversationInfo",
    { conversationId: convoId },
  );
  assertEquals(
    await endpoints.handlers.getConversationInfo({
      conversationId: convoId,
      auth: {
        publicSignKey: outsider.creds.publicSignKey,
        nonce: outsiderInfoSigned.nonce,
        authToken: outsiderInfoSigned.authToken,
      },
    }),
    { error: "not-found" },
  );

  const outsiderCanvasSigned = await signAuthPayload(
    outsider.creds,
    "getCanvasRow",
    { conversationId: convoId },
  );
  assertEquals(
    await endpoints.handlers.getCanvasRow({
      conversationId: convoId,
      auth: {
        publicSignKey: outsider.creds.publicSignKey,
        nonce: outsiderCanvasSigned.nonce,
        authToken: outsiderCanvasSigned.authToken,
      },
    }),
    { row: null },
  );

  Deno.env.delete("ENFORCE_STRICT_METADATA_AUTH");

  assertEquals(
    await endpoints.handlers.getConversations({ publicSignKeys: pairKeys }),
    { conversations: [] },
  );
  assertEquals(
    await endpoints.handlers.getConversationInfo({ conversationId: convoId }),
    { error: "not-found" },
  );
  assertEquals(
    await endpoints.handlers.conversationKey({
      conversationId: convoId,
      publicSignKey: alice.creds.publicSignKey,
    }),
    { error: "no-such-key" },
  );
  assertEquals(
    await endpoints.handlers.getCanvasRow({ conversationId: convoId }),
    { row: null },
  );

  const aliceConvosSigned = await signAuthPayload(
    alice.creds,
    "getConversations",
    { publicSignKeys: pairKeys },
  );
  const strictConvos = await endpoints.handlers.getConversations({
    publicSignKeys: pairKeys,
    auth: {
      publicSignKey: alice.creds.publicSignKey,
      nonce: aliceConvosSigned.nonce,
      authToken: aliceConvosSigned.authToken,
    },
  });
  assertEquals(
    strictConvos.conversations.some((c) => c.id === convoId),
    true,
  );

  const aliceInfoSigned = await signAuthPayload(
    alice.creds,
    "getConversationInfo",
    { conversationId: convoId },
  );
  const strictInfo = await endpoints.handlers.getConversationInfo({
    conversationId: convoId,
    auth: {
      publicSignKey: alice.creds.publicSignKey,
      nonce: aliceInfoSigned.nonce,
      authToken: aliceInfoSigned.authToken,
    },
  });
  assert("conversationInfo" in strictInfo);
  assertEquals(strictInfo.conversationInfo.hasCanvas, true);

  const aliceKeySigned = await signAuthPayload(
    alice.creds,
    "conversationKey",
    { conversationId: convoId },
  );
  const strictKey = await endpoints.handlers.conversationKey({
    conversationId: convoId,
    publicSignKey: alice.creds.publicSignKey,
    auth: {
      nonce: aliceKeySigned.nonce,
      authToken: aliceKeySigned.authToken,
    },
  });
  assertEquals(strictKey, { conversationKey: aliceEncKey });

  const aliceCanvasSigned = await signAuthPayload(
    alice.creds,
    "getCanvasRow",
    { conversationId: convoId },
  );
  const strictCanvas = await endpoints.handlers.getCanvasRow({
    conversationId: convoId,
    auth: {
      publicSignKey: alice.creds.publicSignKey,
      nonce: aliceCanvasSigned.nonce,
      authToken: aliceCanvasSigned.authToken,
    },
  });
  assertExists(strictCanvas.row);
  assertEquals(strictCanvas.row.encrypted, encryptedCanvas);
  assertEquals(strictCanvas.row.version, 1);

  Deno.env.delete("ENFORCE_STRICT_METADATA_AUTH");

  await transact([
    tx.canvases[strictCanvas.row.id].delete(),
    tx.keys[aliceKeyId].delete(),
    tx.conversations[convoId].delete(),
    tx.identities[alice.identityId].delete(),
    tx.identities[bob.identityId].delete(),
    tx.identities[outsider.identityId].delete(),
  ]);
});
