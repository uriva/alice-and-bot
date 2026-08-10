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
  if (missing.length > 0) {
    const withShortId = await Promise.all(
      missing.map(async (identity) => ({
        ...identity,
        shortId: await shortIdFromPublicSignKey(identity.publicSignKey),
      })),
    );
    await chunksOf(transactChunk)(withShortId).reduce(
      (prev, chunk) =>
        prev.then(() =>
          transact(
            chunk.map((identity) =>
              tx.identities[identity.id].update({
                shortId: identity.shortId,
              })
            ),
          )
        ),
      Promise.resolve(),
    );
  }
  console.log(
    `offset=${offset} scanned=${identities.length} backfilled=${missing.length}`,
  );
  return identities.length;
};

const startOffset = Number(Deno.args[0] || "0");

const run = async (): Promise<void> => {
  let offset = startOffset;
  while (true) {
    const scanned = await backfillPage(offset);
    if (scanned < pageSize) break;
    offset += pageSize;
  }
  console.log("done");
};

await run();
