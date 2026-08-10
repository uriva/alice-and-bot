import { query, transact, tx } from "../backend/src/db.ts";
import { shortIdFromPublicSignKey } from "../protocol/src/shortId.ts";

const pageSize = 500;
const transactChunk = 100;

const chunksOf = (size: number) => <T>(xs: T[]): T[][] =>
  xs.length <= size
    ? [xs]
    : [xs.slice(0, size), ...chunksOf(size)(xs.slice(size))];

const backfillPage = async (offset: number): Promise<number> => {
  const { identities } = await query({
    identities: { $: { limit: pageSize, offset } },
  });
  const missing = identities.filter(({ shortId }) => !shortId);
  await chunksOf(transactChunk)(missing).reduce(
    (prev, chunk) =>
      prev.then(() =>
        transact(
          chunk.map((identity) =>
            tx.identities[identity.id].update({
              shortId: shortIdFromPublicSignKey(identity.publicSignKey),
            })
          ),
        )
      ),
    Promise.resolve(),
  );
  console.log(
    `offset=${offset} scanned=${identities.length} backfilled=${missing.length}`,
  );
  return identities.length;
};

const run = async (offset: number): Promise<void> => {
  const scanned = await backfillPage(offset);
  if (scanned === pageSize) return run(offset + pageSize);
};

await run(0);
console.log("done");
