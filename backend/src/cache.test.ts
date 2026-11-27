import { id } from "@instantdb/admin";
import { assert, assertEquals } from "@std/assert";
import webpush from "web-push";
import type { Credentials } from "../../protocol/src/clientApi.ts";
import {
  base64ToBase64Url,
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "../../protocol/src/crypto.ts";
import { canonicalStringForAuthSignV2 } from "./api.ts";
import { issueNonceHelper } from "./auth.ts";
import { clearBackendCaches, createTtlCache } from "./cache.ts";
import { transact, tx } from "./db.ts";
import { endpoints, handleRequest, setRequestWaitUntil } from "./main.ts";

type AdminCounts = {
  queries: number;
  transacts: number;
  queryBodies: string[];
};

const countAdminDbCalls = async <T>(
  fn: () => Promise<T>,
): Promise<{ result: T; counts: AdminCounts }> => {
  const counts: AdminCounts = { queries: 0, transacts: 0, queryBodies: [] };
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    if (url.includes("/admin/query")) {
      counts.queries += 1;
      if (typeof init?.body === "string") counts.queryBodies.push(init.body);
    } else if (url.includes("/admin/transact")) {
      counts.transacts += 1;
    }
    return origFetch(input, init);
  };
  const result = await fn().finally(() => {
    globalThis.fetch = origFetch;
  });
  return { result, counts };
};

const makeTestIdentity = async (
  name: string,
  extra?: { priceTag?: number; balance?: number; alias?: string },
) => {
  const [signKp, encKp] = await Promise.all([
    generateKeyPair("sign"),
    generateKeyPair("encrypt"),
  ]);
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
      ...(extra?.alias !== undefined ? { alias: extra.alias } : {}),
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

const signV2 = async <T>(
  creds: Credentials,
  action: string,
  payload: T,
) => {
  const nonce = await issueNonceHelper(creds.publicSignKey);
  const authToken = await sign(
    creds.privateSignKey,
    await canonicalStringForAuthSignV2({
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

const toBase64Url = (buf: ArrayBuffer) =>
  base64ToBase64Url(btoa(String.fromCharCode(...new Uint8Array(buf))));

const makeRealPushSubscription = async (endpoint: string) => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const rawPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: toBase64Url(rawPublic.buffer),
      auth: toBase64Url(authBytes.buffer),
    },
  };
};

Deno.test("createTtlCache enforces TTL, LRU maxEntries, empty array caching, deleteWhere, and generation bumps", () => {
  const clock = { now: 1_000 };
  const cache = createTtlCache<string[]>({
    ttlMs: 500,
    maxEntries: 2,
    now: () => clock.now,
  });

  cache.set("a", []);
  assertEquals(cache.get("a"), { hit: true, value: [] });

  cache.set("b", ["x"]);
  // Access "a" so "b" becomes least recently used
  assertEquals(cache.get("a"), { hit: true, value: [] });
  cache.set("c", ["y"]);
  assertEquals(cache.size(), 2);
  assertEquals(cache.get("b"), { hit: false });
  assertEquals(cache.get("a"), { hit: true, value: [] });
  assertEquals(cache.get("c"), { hit: true, value: ["y"] });

  const genBefore = cache.generation();
  cache.deleteWhere((_k, v) => v.includes("y"));
  assertEquals(cache.generation() > genBefore, true);
  assertEquals(cache.get("c"), { hit: false });

  clock.now += 501;
  assertEquals(cache.get("a"), { hit: false });
});

Deno.test("heartbeat executes zero InstantDB queries and zero transacts", async () => {
  clearBackendCaches();
  const user = await makeTestIdentity("HeartbeatUser");
  const signed = await signV2(user.creds, "heartbeat", {});

  const { result, counts } = await countAdminDbCalls(() =>
    endpoints.handlers.heartbeat(signed)
  );
  assertEquals(result, { success: true });
  assertEquals(counts.queries, 0);
  assertEquals(counts.transacts, 0);

  await transact(tx.identities[user.identityId].delete());
});

Deno.test("ui-update stream chunks cache verifyParticipant so repeated chunks make zero InstantDB queries", async () => {
  clearBackendCaches();
  const alice = await makeTestIdentity("StreamAlice");
  const convoId = id();
  await transact(
    tx.conversations[convoId]
      .update({ title: "Stream Chat", updatedAt: Date.now() })
      .link({ participants: [alice.identityId] }),
  );

  const sendChunk = async (text: string) => {
    const body = {
      elementId: "stream-el-1",
      conversationId: convoId,
      type: "stream",
      text,
      active: true,
      authorId: alice.creds.publicSignKey,
    };
    const signed = await signV2(alice.creds, "uiUpdate", body);
    return handleRequest(
      new Request("http://localhost/ui-update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          auth: {
            publicSignKey: alice.creds.publicSignKey,
            nonce: signed.nonce,
            authToken: signed.authToken,
          },
        }),
      }),
    );
  };

  const first = await countAdminDbCalls(() => sendChunk("Hello"));
  assertEquals(first.result.status, 200);
  assertEquals(first.counts.queries, 1);

  const second = await countAdminDbCalls(() => sendChunk("Hello world"));
  assertEquals(second.result.status, 200);
  assertEquals(second.counts.queries, 0);

  const third = await countAdminDbCalls(() => sendChunk("Hello world!"));
  assertEquals(third.result.status, 200);
  assertEquals(third.counts.queries, 0);

  await transact([
    tx.conversations[convoId].delete(),
    tx.identities[alice.identityId].delete(),
  ]);
});

Deno.test("getConversationInfo, conversationKey, getProfile, and getMessages use caches and invalidate on mutations", async () => {
  clearBackendCaches();
  const uniqueAlias = `cache_${crypto.randomUUID().slice(0, 8)}`;
  const alice = await makeTestIdentity("CacheAlice", { alias: uniqueAlias });
  const bob = await makeTestIdentity("CacheBob");
  const convoId = id();
  const keyId = id();
  const symKey = await generateSymmetricKey();
  const aliceEncKey = await encryptAsymmetric(alice.publicEncryptKey, symKey);

  await transact([
    tx.conversations[convoId]
      .update({ title: "Cache Chat", updatedAt: Date.now() })
      .link({ participants: [alice.identityId, bob.identityId] }),
    tx.keys[keyId]
      .update({ key: aliceEncKey })
      .link({ owner: alice.identityId, conversation: convoId }),
  ]);

  const infoAuth1 = await signV2(alice.creds, "getConversationInfo", {
    conversationId: convoId,
  });
  const info1 = await countAdminDbCalls(() =>
    endpoints.handlers.getConversationInfo({
      conversationId: convoId,
      auth: {
        publicSignKey: alice.creds.publicSignKey,
        nonce: infoAuth1.nonce,
        authToken: infoAuth1.authToken,
      },
    })
  );
  assert("conversationInfo" in info1.result);
  assertEquals(info1.result.conversationInfo.hasCanvas, false);
  // 1 query total (no redundant second identities query)
  assertEquals(info1.counts.queries, 1);

  // Second getConversationInfo hits cache (0 queries)
  const infoAuth2 = await signV2(alice.creds, "getConversationInfo", {
    conversationId: convoId,
  });
  const info2 = await countAdminDbCalls(() =>
    endpoints.handlers.getConversationInfo({
      conversationId: convoId,
      auth: {
        publicSignKey: alice.creds.publicSignKey,
        nonce: infoAuth2.nonce,
        authToken: infoAuth2.authToken,
      },
    })
  );
  assertEquals(info2.counts.queries, 0);

  // conversationKey was already warmed by getCachedConversation (0 queries)
  const keyAuth = await signV2(alice.creds, "conversationKey", {
    conversationId: convoId,
  });
  const keyRes = await countAdminDbCalls(() =>
    endpoints.handlers.conversationKey({
      conversationId: convoId,
      publicSignKey: alice.creds.publicSignKey,
      auth: { nonce: keyAuth.nonce, authToken: keyAuth.authToken },
    })
  );
  assertEquals(keyRes.result, { conversationKey: aliceEncKey });
  assertEquals(keyRes.counts.queries, 0);

  // getMessages uses cached participant check (only 1 messages query, no conversation join)
  const msgsAuth = await signV2(alice.creds, "getMessages", {
    conversationId: convoId,
  });
  const msgsRes = await countAdminDbCalls(() =>
    endpoints.handlers.getMessages(msgsAuth)
  );
  assert("messages" in msgsRes.result);
  assertEquals(msgsRes.counts.queries, 1);
  const parsedMsgsQuery = JSON.parse(msgsRes.counts.queryBodies[0]);
  assertEquals("conversation" in parsedMsgsQuery.query.messages, false);

  // saveCanvas invalidates conversation cache so hasCanvas updates to true
  const encCanvas = await encryptSymmetric(symKey, "view = () => div([])");
  const saveCanvasAuth = await signV2(alice.creds, "saveCanvas", {
    conversationId: convoId,
    encrypted: encCanvas,
    expectedVersion: 0,
  });
  const savedCanvas = await endpoints.handlers.saveCanvas(saveCanvasAuth);
  assertEquals(savedCanvas, { ok: true, version: 1 });

  const infoAuth3 = await signV2(alice.creds, "getConversationInfo", {
    conversationId: convoId,
  });
  const info3 = await countAdminDbCalls(() =>
    endpoints.handlers.getConversationInfo({
      conversationId: convoId,
      auth: {
        publicSignKey: alice.creds.publicSignKey,
        nonce: infoAuth3.nonce,
        authToken: infoAuth3.authToken,
      },
    })
  );
  assert("conversationInfo" in info3.result);
  assertEquals(info3.result.conversationInfo.hasCanvas, true);
  assertEquals(info3.counts.queries, 1);

  // Identity cache: getProfile + aliasToPublicSignKey + resolveHandle
  const prof1 = await countAdminDbCalls(() =>
    endpoints.handlers.getProfile({ publicSignKey: alice.creds.publicSignKey })
  );
  assertEquals(prof1.counts.queries, 1);
  const prof2 = await countAdminDbCalls(() =>
    endpoints.handlers.getProfile({ publicSignKey: alice.creds.publicSignKey })
  );
  assertEquals(prof2.counts.queries, 0);
  const aliasRes = await countAdminDbCalls(() =>
    endpoints.handlers.aliasToPublicSignKey({ alias: uniqueAlias })
  );
  assertEquals(aliasRes.result, { publicSignKey: alice.creds.publicSignKey });
  assertEquals(aliasRes.counts.queries, 0);
  const handleRes = await countAdminDbCalls(() =>
    endpoints.handlers.resolveHandle({ handle: `@${uniqueAlias}` })
  );
  assertEquals(handleRes.result, { publicSignKey: alice.creds.publicSignKey });
  assertEquals(handleRes.counts.queries, 0);

  // setName invalidates identity cache and conversation cache
  const renameAuth = await signV2(alice.creds, "setName", {
    name: "CacheAliceRenamed",
  });
  assertEquals(await endpoints.handlers.setName(renameAuth), { success: true });
  const prof3 = await endpoints.handlers.getProfile({
    publicSignKey: alice.creds.publicSignKey,
  });
  assertEquals(prof3.profile?.name, "CacheAliceRenamed");

  // Clean up canvas row too
  const canvasRowAuth = await signV2(alice.creds, "getCanvasRow", {
    conversationId: convoId,
  });
  const canvasRow = await endpoints.handlers.getCanvasRow({
    conversationId: convoId,
    auth: {
      publicSignKey: alice.creds.publicSignKey,
      nonce: canvasRowAuth.nonce,
      authToken: canvasRowAuth.authToken,
    },
  });

  await transact([
    ...(canvasRow.row ? [tx.canvases[canvasRow.row.id].delete()] : []),
    tx.keys[keyId].delete(),
    tx.conversations[convoId].delete(),
    tx.identities[alice.identityId].delete(),
    tx.identities[bob.identityId].delete(),
  ]);
});

Deno.test("registerPushSubscription skips transact when unchanged and unregisterPushSubscription runs 1 query", async () => {
  clearBackendCaches();
  const user = await makeTestIdentity("PushDedupUser");
  const endpoint =
    `https://fcm.googleapis.com/fcm/send/dedup-${crypto.randomUUID()}`;
  const sub = {
    endpoint,
    expirationTime: null,
    keys: { p256dh: "p256-key-1", auth: "auth-key-1" },
  };

  const reg1Auth = await signV2(user.creds, "registerPushSubscription", {
    subscription: sub,
  });
  const reg1 = await countAdminDbCalls(() =>
    endpoints.handlers.registerPushSubscription(reg1Auth)
  );
  assertEquals(reg1.result, { success: true });
  assertEquals(reg1.counts.transacts, 1);

  // Repeat registration with identical endpoint/keys/owner skips transact!
  const reg2Auth = await signV2(user.creds, "registerPushSubscription", {
    subscription: sub,
  });
  const reg2 = await countAdminDbCalls(() =>
    endpoints.handlers.registerPushSubscription(reg2Auth)
  );
  assertEquals(reg2.result, { success: true });
  assertEquals(reg2.counts.transacts, 0);

  // unregisterPushSubscription combines 2 queries into 1
  const unregAuth = await signV2(user.creds, "unregisterPushSubscription", {
    endpoint,
  });
  const unreg = await countAdminDbCalls(() =>
    endpoints.handlers.unregisterPushSubscription(unregAuth)
  );
  assertEquals(unreg.result, { success: true });
  assertEquals(unreg.counts.queries, 1);
  assertEquals(unreg.counts.transacts, 1);

  await transact(tx.identities[user.identityId].delete());
});

Deno.test("mintInstantToken combines identity and conversation bootstrap into 1 query", async () => {
  clearBackendCaches();
  const alice = await makeTestIdentity("MintCombinedAlice");
  const convoId = id();
  const keyId = id();
  const symKey = await generateSymmetricKey();
  const encKey = await encryptAsymmetric(alice.publicEncryptKey, symKey);

  await transact([
    tx.conversations[convoId]
      .update({ title: "Mint Combined", updatedAt: Date.now() })
      .link({ participants: [alice.identityId] }),
    tx.keys[keyId]
      .update({ key: encKey })
      .link({ owner: alice.identityId, conversation: convoId }),
  ]);

  const signed = await signV2(alice.creds, "mintInstantToken", {
    includeConversations: true,
    conversationId: convoId,
  });
  const res = await countAdminDbCalls(() =>
    endpoints.handlers.mintInstantToken(signed)
  );
  assert("token" in res.result);
  assertEquals(res.result.conversationBootstrap?.hasAccess, true);
  assertEquals(res.counts.queries, 1);

  await transact([
    tx.keys[keyId].delete(),
    tx.conversations[convoId].delete(),
    tx.identities[alice.identityId].delete(),
  ]);
});

Deno.test("sendMessage caches empty pushSubscriptions for bots and batches multi-device push updates/deletes into 1 transact", async () => {
  clearBackendCaches();
  const vapid = webpush.generateVAPIDKeys();
  Deno.env.set("VAPID_PUBLIC_KEY", vapid.publicKey);
  Deno.env.set("VAPID_PRIVATE_KEY", vapid.privateKey);
  Deno.env.set("ALLOW_LOCAL_WEBHOOKS", "1");

  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const { pathname } = new URL(req.url);
    await req.arrayBuffer();
    return new Response("", { status: pathname === "/gone" ? 410 : 201 });
  });
  const port = server.addr.port;

  const alice = await makeTestIdentity("BatchAlice");
  const bot = await makeTestIdentity("BatchBot");
  const convoId = id();
  const sub1Id = id();
  const sub2Id = id();
  const subGoneId = id();

  const [sub1, sub2, subGone] = await Promise.all([
    makeRealPushSubscription(`http://127.0.0.1:${port}/dev1`),
    makeRealPushSubscription(`http://127.0.0.1:${port}/dev2`),
    makeRealPushSubscription(`http://127.0.0.1:${port}/gone`),
  ]);

  await transact([
    tx.conversations[convoId]
      .update({ title: "Batch Push Chat", updatedAt: Date.now() })
      .link({ participants: [alice.identityId, bot.identityId] }),
    tx.pushSubscriptions[sub1Id]
      .update({
        endpoint: sub1.endpoint,
        subscription: sub1,
        createdAt: Date.now(),
      })
      .link({ owner: alice.identityId }),
    tx.pushSubscriptions[sub2Id]
      .update({
        endpoint: sub2.endpoint,
        subscription: sub2,
        createdAt: Date.now(),
      })
      .link({ owner: alice.identityId }),
    tx.pushSubscriptions[subGoneId]
      .update({
        endpoint: subGone.endpoint,
        subscription: subGone,
        createdAt: Date.now(),
      })
      .link({ owner: alice.identityId }),
  ]);

  // First bot message: 1 conversation query + 1 alice pushSubs query + 1 bot pushSubs query (caches [])
  // Transacts: 1 for message + 1 SINGLE batched transact for 2 updates + 1 delete = 2 transacts total!
  const bg1: Promise<unknown>[] = [];
  setRequestWaitUntil((p) => bg1.push(p));
  const msg1Auth = await signV2(bot.creds, "sendMessage", {
    conversation: convoId,
    encryptedMessage: "msg-1",
  });
  const send1 = await countAdminDbCalls(async () => {
    const res = await endpoints.handlers.sendMessage({
      conversation: convoId,
      encryptedMessage: "msg-1",
      senderPublicSignKey: bot.creds.publicSignKey,
      auth: { nonce: msg1Auth.nonce, authToken: msg1Auth.authToken },
    });
    await Promise.all(bg1);
    return res;
  });
  assertEquals(send1.counts.transacts, 2);

  // Second bot message: conversation cached, alice pushSubs cached (already notified), bot pushSubs cached ([])
  // -> 0 InstantDB queries and only 1 transact (for the message itself)!
  const bg2: Promise<unknown>[] = [];
  setRequestWaitUntil((p) => bg2.push(p));
  const msg2Auth = await signV2(bot.creds, "sendMessage", {
    conversation: convoId,
    encryptedMessage: "msg-2",
  });
  const send2 = await countAdminDbCalls(async () => {
    const res = await endpoints.handlers.sendMessage({
      conversation: convoId,
      encryptedMessage: "msg-2",
      senderPublicSignKey: bot.creds.publicSignKey,
      auth: { nonce: msg2Auth.nonce, authToken: msg2Auth.authToken },
    });
    await Promise.all(bg2);
    return res;
  });
  setRequestWaitUntil(undefined);
  assertEquals(send2.counts.queries, 0);
  assertEquals(send2.counts.transacts, 1);

  await transact([
    tx.messages[send1.result.messageId].delete(),
    tx.messages[send2.result.messageId].delete(),
    tx.pushSubscriptions[sub1Id].delete(),
    tx.pushSubscriptions[sub2Id].delete(),
    tx.conversations[convoId].delete(),
    tx.identities[alice.identityId].delete(),
    tx.identities[bot.identityId].delete(),
  ]);
  await server.shutdown();
  Deno.env.delete("ALLOW_LOCAL_WEBHOOKS");
});

Deno.test("createConversation hoists sender conversations query out of priced recipients loop", async () => {
  clearBackendCaches();
  const sender = await makeTestIdentity("HoistSender", { balance: 1_000 });
  const vip1 = await makeTestIdentity("HoistVip1", { priceTag: 100 });
  const vip2 = await makeTestIdentity("HoistVip2", { priceTag: 100 });
  const vip3 = await makeTestIdentity("HoistVip3", { priceTag: 100 });
  const symKey = await generateSymmetricKey();
  const keyMap = {
    [sender.creds.publicSignKey]: await encryptAsymmetric(
      sender.publicEncryptKey,
      symKey,
    ),
    [vip1.creds.publicSignKey]: await encryptAsymmetric(
      vip1.publicEncryptKey,
      symKey,
    ),
    [vip2.creds.publicSignKey]: await encryptAsymmetric(
      vip2.publicEncryptKey,
      symKey,
    ),
    [vip3.creds.publicSignKey]: await encryptAsymmetric(
      vip3.publicEncryptKey,
      symKey,
    ),
  };

  const signed = await signV2(sender.creds, "createConversation", {
    title: "Hoist Group",
    publicSignKeyToEncryptedSymmetricKey: keyMap,
  });
  const res = await countAdminDbCalls(() =>
    endpoints.handlers.createConversation(signed)
  );
  assert("conversationId" in res.result);
  // 1 query for identities + 1 hoisted query for sender's conversations (NOT 1 + 3 = 4!)
  assertEquals(res.counts.queries, 2);

  await transact([
    tx.conversations[res.result.conversationId].delete(),
    tx.wallets[sender.walletId!].delete(),
    tx.identities[sender.identityId].delete(),
    tx.identities[vip1.identityId].delete(),
    tx.identities[vip2.identityId].delete(),
    tx.identities[vip3.identityId].delete(),
  ]);
});
