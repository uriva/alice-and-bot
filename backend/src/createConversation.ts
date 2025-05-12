import { id, User, User as InstantUser } from "@instantdb/core";
import { map } from "gamla";
import { ApiImplementation } from "typed-api";
import { BackendApi } from "./api.ts";
import { query, transact, tx } from "./db.ts";

export const createConversation: ApiImplementation<
  InstantUser,
  BackendApi
>["handlers"]["createConversation"]["handler"] = async (
  { email }: User,
  { title, publicSignKeyToEncryptedSymmetricKey },
) => {
  const { identities } = await query({
    identities: {
      account: {},
      $: {
        where: {
          publicSignKey: {
            $in: Object.keys(publicSignKeyToEncryptedSymmetricKey),
          },
        },
      },
    },
  });
  if (
    identities.length !==
      Object.keys(publicSignKeyToEncryptedSymmetricKey).length
  ) {
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
  await transact(
    map((identity) =>
      tx.keys[id()]
        .update({
          key: publicSignKeyToEncryptedSymmetricKey[identity.publicSignKey],
        }).link({ conversation: conversationId, owner: identity.id })
    )(identities),
  );
  return { success: true, conversationId };
};
