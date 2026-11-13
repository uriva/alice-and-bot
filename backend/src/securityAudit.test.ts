import { id } from "@instantdb/admin";
import {
  assert,
  assertEquals,
  assertFalse,
  assertMatch,
  assertRejects,
} from "@std/assert";
import rules from "../../instant.perms.ts";
import {
  type Credentials,
  handleWebhookUpdate,
  msgToStr,
} from "../../protocol/src/clientApi.ts";
import {
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "../../protocol/src/crypto.ts";
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
import { query, transact, tx } from "./db.ts";
import { endpoints, handleRequest, relayStoreMessage } from "./main.ts";
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
      link: { archivedConversations: "true" },
      unlink: { archivedConversations: "true" },
    },
    fields: {
      webhook: "false",
    },
  });

  const readOnlyChatEntities = [
    "conversations",
    "messages",
    "keys",
    "canvases",
    "typingStates",
    "uiElements",
  ] as const;
  readOnlyChatEntities.forEach((entity) => {
    assertEquals(
      permsRecord[entity],
      {
        allow: {
          view: "true",
          create: "false",
          update: "false",
          delete: "false",
        },
      },
      `Expected ${entity} to allow view only`,
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
