import { id } from "@instantdb/core";
import { map } from "gamla";
import type { EncryptedConversationKey } from "../../protocol/src/api.ts";
import type { BackendApiImpl } from "./api.ts";
import { query, transact, tx } from "./db.ts";

export const createConversation:
  BackendApiImpl["handlers"]["createConversation"] = async (
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
            key: publicSignKeyToEncryptedSymmetricKey[
              identity.publicSignKey
            ] as EncryptedConversationKey,
          }).link({ conversation: conversationId, owner: identity.id })
      )(identities),
    );
    return { success: true, conversationId };
  };
