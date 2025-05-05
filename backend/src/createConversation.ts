import { id, User } from "@instantdb/admin";
import { map, sideLog } from "gamla";
import { encryptAsymmetric, generateSymmetricKey } from "../../protocol/src/crypto.ts";
import { BackendApi } from "./api.ts";
import { query, transact, tx } from "./db.ts";

export const createConversation = async (
  { email }: User,
  { title, publicSignKeys }: {
    title: string;
    publicSignKeys: string[];
  },
): Promise<BackendApi["createConversation"]["output"]> => {
  const { identities } = await query({
    identities: {
      account: {},
      $: {
        where: {
          publicSignKey: { $in: publicSignKeys },
        },
      },
    },
  });
  if (identities.length !== publicSignKeys.length) {
    return { success: false, error: "invalid-participants" };
  }
  if (!identities.some((identity) => identity.account?.email === email)) {
    return { success: false, error: "must-own-an-identity" };
  }
  const conversationId = id();
  await transact(
    tx.conversations[conversationId].update({ title }).link({
      participants: identities.map((x) => x.id),
    }),
  );
  const symmetricKey = sideLog(await generateSymmetricKey());
  await transact(
    await map(async (identity) =>
      tx.keys[id()]
        .update({
          key: await encryptAsymmetric(identity.publicEncryptKey, symmetricKey),
        })
        .link({ conversation: conversationId, owner: identity.id })
    )(identities),
  );
  return { success: true, conversationId };
};
