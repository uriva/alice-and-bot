import { assertEquals } from "@std/assert";
import { id } from "@instantdb/admin";
import { retentionDays, retentionMs } from "../../protocol/src/retention.ts";
import {
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "../../protocol/src/crypto.ts";
import { msgToStr } from "../../protocol/src/clientApi.ts";
import { query, transact, tx } from "./db.ts";
import { pruneExpiredMessages } from "./retention.ts";

const makeEncryptedTestPayload = async (
  conversationId: string,
  symKey: string,
  signKeys: { publicKey: string; privateKey: string },
  text: string,
  sentAt: number,
) => {
  const inner = { type: "text" as const, text, conversationId, sentAt };
  const signature = await sign(signKeys.privateKey, msgToStr(inner));
  return encryptSymmetric(symKey, {
    payload: inner,
    publicSignKey: signKeys.publicKey,
    signature,
  });
};

Deno.test("retention constants define 30-day rolling retention", () => {
  assertEquals(retentionDays, 30);
  assertEquals(retentionMs, 30 * 24 * 60 * 60 * 1000);
});

Deno.test("pruneExpiredMessages deletes expired messages while keeping fresh messages, conversations, and keys", async () => {
  const signKeys = await generateKeyPair("sign");
  const encKeys = await generateKeyPair("encrypt");
  const symKey = await generateSymmetricKey();
  const encKey = await encryptAsymmetric(encKeys.publicKey, symKey);

  const identityId = id();
  const conversationId = id();
  const keyId = id();
  const expiredMsgId = id();
  const freshMsgId = id();

  const expiredPayload = await makeEncryptedTestPayload(
    conversationId,
    symKey,
    signKeys,
    "old message",
    1_000,
  );
  const freshPayload = await makeEncryptedTestPayload(
    conversationId,
    symKey,
    signKeys,
    "recent message",
    Date.now(),
  );

  await transact([
    tx.identities[identityId].update({
      name: "Retention Test",
      publicSignKey: signKeys.publicKey,
      publicEncryptKey: encKeys.publicKey,
    }),
    tx.conversations[conversationId]
      .update({ title: "Retention Test Chat", updatedAt: Date.now() })
      .link({ participants: [identityId] }),
    tx.keys[keyId]
      .update({ key: encKey })
      .link({ conversation: conversationId, owner: identityId }),
    tx.messages[expiredMsgId]
      .update({ payload: expiredPayload, timestamp: 1_000 })
      .link({ conversation: conversationId }),
    tx.messages[freshMsgId]
      .update({ payload: freshPayload, timestamp: Date.now() })
      .link({ conversation: conversationId }),
  ]);

  const result = await pruneExpiredMessages({ cutoffMs: 5_000 });
  assertEquals(result.deletedCount >= 1, true);
  assertEquals(result.reachedBatchLimit, false);

  const { messages, conversations, keys } = await query({
    messages: { $: { where: { id: { $in: [expiredMsgId, freshMsgId] } } } },
    conversations: { $: { where: { id: conversationId } } },
    keys: { $: { where: { id: keyId } } },
  });

  assertEquals(messages.map((m) => m.id), [freshMsgId]);
  assertEquals(conversations.map((c) => c.id), [conversationId]);
  assertEquals(keys.map((k) => k.id), [keyId]);

  await transact([
    tx.messages[freshMsgId].delete(),
    tx.keys[keyId].delete(),
    tx.conversations[conversationId].delete(),
    tx.identities[identityId].delete(),
  ]);
});

Deno.test("pruneExpiredMessages paginates across batches and respects maxBatches", async () => {
  const signKeys = await generateKeyPair("sign");
  const encKeys = await generateKeyPair("encrypt");
  const symKey = await generateSymmetricKey();

  const identityId = id();
  const conversationId = id();
  const msgIds = [id(), id(), id()];

  const payloads = await Promise.all(
    msgIds.map((_, idx) =>
      makeEncryptedTestPayload(
        conversationId,
        symKey,
        signKeys,
        `batch-${idx}`,
        1_100 + idx,
      )
    ),
  );

  await transact([
    tx.identities[identityId].update({
      name: "Batch Retention Test",
      publicSignKey: signKeys.publicKey,
      publicEncryptKey: encKeys.publicKey,
    }),
    tx.conversations[conversationId]
      .update({ title: "Batch Retention Chat", updatedAt: Date.now() })
      .link({ participants: [identityId] }),
    ...msgIds.map((msgId, idx) =>
      tx.messages[msgId]
        .update({ payload: payloads[idx], timestamp: 1_100 + idx })
        .link({ conversation: conversationId })
    ),
  ]);

  const firstRun = await pruneExpiredMessages({
    cutoffMs: 5_000,
    batchSize: 2,
    maxBatches: 1,
  });
  assertEquals(firstRun.deletedCount, 2);
  assertEquals(firstRun.batchesRun, 1);
  assertEquals(firstRun.reachedBatchLimit, true);

  const secondRun = await pruneExpiredMessages({
    cutoffMs: 5_000,
    batchSize: 2,
    maxBatches: 5,
  });
  assertEquals(secondRun.deletedCount >= 1, true);
  assertEquals(secondRun.reachedBatchLimit, false);

  const { messages } = await query({
    messages: { $: { where: { id: { $in: msgIds } } } },
  });
  assertEquals(messages.length, 0);

  await transact([
    tx.conversations[conversationId].delete(),
    tx.identities[identityId].delete(),
  ]);
});
