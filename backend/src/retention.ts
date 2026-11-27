import { empty, map } from "@uri/gamla";
import { retentionMs } from "../../protocol/src/retention.ts";
import { query, transact, tx } from "./db.ts";

export const defaultRetentionBatchSize = 200;
export const defaultRetentionMaxBatches = 25;

export type PruneMessagesResult = {
  deletedCount: number;
  batchesRun: number;
  reachedBatchLimit: boolean;
};

type PruneState = {
  cutoffMs: number;
  batchSize: number;
  maxBatches: number;
  deletedCount: number;
  batchesRun: number;
};

const ascTimestampOrder: { timestamp: "asc" } = { timestamp: "asc" };
const messageRetentionFields: ("id" | "timestamp")[] = ["id", "timestamp"];

const pruneBatch = async (state: PruneState): Promise<PruneMessagesResult> => {
  const { cutoffMs, batchSize, maxBatches, deletedCount, batchesRun } = state;
  const { messages } = await query({
    messages: {
      $: {
        order: ascTimestampOrder,
        limit: batchSize,
        fields: messageRetentionFields,
      },
    },
  });
  const expired = messages.filter((m) => m.timestamp < cutoffMs);
  if (empty(expired)) {
    return { deletedCount, batchesRun, reachedBatchLimit: false };
  }
  await transact(
    map(({ id }: { id: string }) => tx.messages[id].delete())(expired),
  );
  const nextDeletedCount = deletedCount + expired.length;
  const nextBatchesRun = batchesRun + 1;
  if (expired.length < batchSize) {
    return {
      deletedCount: nextDeletedCount,
      batchesRun: nextBatchesRun,
      reachedBatchLimit: false,
    };
  }
  if (nextBatchesRun >= maxBatches) {
    return {
      deletedCount: nextDeletedCount,
      batchesRun: nextBatchesRun,
      reachedBatchLimit: true,
    };
  }
  return pruneBatch({
    ...state,
    deletedCount: nextDeletedCount,
    batchesRun: nextBatchesRun,
  });
};

export const pruneExpiredMessages = ({
  nowMs = Date.now(),
  cutoffMs = nowMs - retentionMs,
  batchSize = defaultRetentionBatchSize,
  maxBatches = defaultRetentionMaxBatches,
}: {
  nowMs?: number;
  cutoffMs?: number;
  batchSize?: number;
  maxBatches?: number;
} = {}): Promise<PruneMessagesResult> =>
  pruneBatch({
    cutoffMs,
    batchSize,
    maxBatches,
    deletedCount: 0,
    batchesRun: 0,
  });
