import { id } from "@instantdb/core";
import type { EncryptedConversationKey } from "../../protocol/src/clientApi.ts";
import type { BackendApiImpl } from "./api.ts";
import { verifyAuthToken } from "./auth.ts";
import { query, transact, tx } from "./db.ts";
import { withMultiWalletLock } from "./walletLock.ts";

const isEncryptedConversationKey = (
  v: string | undefined,
): v is EncryptedConversationKey => typeof v === "string";

const hasExistingDirectConversation = async (
  senderId: string,
  recipientId: string,
): Promise<boolean> => {
  const { conversations } = await query({
    conversations: {
      participants: {},
      $: {
        where: {
          "participants.id": senderId,
        },
      },
    },
  });
  return conversations.some(
    (c) =>
      c.participants.length === 2 &&
      c.participants.some((p) => p.id === senderId) &&
      c.participants.some((p) => p.id === recipientId),
  );
};

export const createConversation:
  BackendApiImpl["handlers"]["createConversation"] = async ({
    payload: { title, publicSignKeyToEncryptedSymmetricKey },
    publicSignKey,
    nonce,
    authToken,
  }) => {
    const authOk = await verifyAuthToken({
      action: "createConversation",
      payload: { title, publicSignKeyToEncryptedSymmetricKey },
      publicSignKey,
      nonce,
      authToken,
    });
    if (!authOk) return { error: "invalid-auth" as const };

    const requestedKeys = Object.keys(publicSignKeyToEncryptedSymmetricKey);

    return withMultiWalletLock(requestedKeys, async () => {
      const { identities } = await query({
        identities: {
          wallet: {},
          $: {
            where: {
              publicSignKey: { $in: requestedKeys },
            },
          },
        },
      });

      const sender = identities.find((i) => i.publicSignKey === publicSignKey);
      if (!sender) return { error: "must-own-an-identity" as const };

      if (identities.length !== requestedKeys.length) {
        return { error: "invalid-participants" as const };
      }

      const recipients = identities.filter(
        (i) => i.publicSignKey !== publicSignKey,
      );

      const chargeableRecipients = (
        await Promise.all(
          recipients.map(async (recipient) => {
            if (!recipient.priceTag || recipient.priceTag <= 0) return null;
            const waived = await hasExistingDirectConversation(
              sender.id,
              recipient.id,
            );
            return waived ? null : recipient;
          }),
        )
      ).filter((r): r is NonNullable<typeof r> => r !== null);

      const totalCost = chargeableRecipients.reduce(
        (sum, r) => sum + (r.priceTag ?? 0),
        0,
      );

      if (totalCost > 0) {
        const senderBalance = sender.wallet?.balance ?? 0;
        if (senderBalance < totalCost) {
          return { error: "insufficient-balance" as const };
        }
      }

      const targetUpdates = chargeableRecipients.map((recipient) =>
        tx.wallets[recipient.wallet?.id || id()]
          .update({
            balance: (recipient.wallet?.balance ?? 0) +
              (recipient.priceTag ?? 0),
          })
          .link({ identity: recipient.id })
      );

      const senderDeduction = totalCost > 0
        ? [
          tx.wallets[sender.wallet?.id || id()]
            .update({
              balance: (sender.wallet?.balance ?? 0) - totalCost,
            })
            .link({ identity: sender.id }),
        ]
        : [];

      const outreachTransactions = chargeableRecipients.map((recipient) =>
        tx.transactions[id()]
          .update({
            amount: recipient.priceTag ?? 0,
            type: "outreach",
            timestamp: Date.now(),
            status: "completed",
          })
          .link({ sender: sender.id, receiver: recipient.id })
      );

      const conversationId = id();

      const keyTxs = identities.map((identity) => {
        const encKey =
          publicSignKeyToEncryptedSymmetricKey[identity.publicSignKey];
        if (!isEncryptedConversationKey(encKey)) {
          throw new Error("Missing encrypted conversation key");
        }
        return tx.keys[id()]
          .update({ key: encKey })
          .link({ conversation: conversationId, owner: identity.id });
      });

      await transact([
        tx.conversations[conversationId]
          .update({
            title,
            updatedAt: Date.now(),
          })
          .link({
            participants: identities.map((x) => x.id),
            admins: [sender.id],
          }),
        ...targetUpdates,
        ...senderDeduction,
        ...outreachTransactions,
        ...keyTxs,
      ]);

      return { conversationId };
    });
  };
