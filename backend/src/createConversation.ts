// deno-lint-ignore-file
import { id } from "@instantdb/core";
import { map } from "@uri/gamla";
import type { EncryptedConversationKey } from "../../protocol/src/clientApi.ts";
import type { BackendApiImpl } from "./api.ts";
import { query, transact, tx } from "./db.ts";

import { verifyAuthToken } from "./auth.ts";

export const createConversation:
  BackendApiImpl["handlers"]["createConversation"] = async (
    {
      payload: { title, publicSignKeyToEncryptedSymmetricKey },
      publicSignKey,
      nonce,
      authToken,
    },
  ) => {
    const authOk = await verifyAuthToken({
      action: "createConversation",
      payload: { title, publicSignKeyToEncryptedSymmetricKey },
      publicSignKey,
      nonce,
      authToken,
    });
    if (!authOk) return { error: "invalid-auth" as const };

    const { identities } = await query({
      identities: {
        wallet: {},
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

    // Check sender
    const sender = identities.find((i) => i.publicSignKey === publicSignKey);
    if (!sender) return { error: "must-own-an-identity" as const };

    // Outreach cost logic
    let totalCost = 0;
    const recipients = identities.filter((i) =>
      i.publicSignKey !== publicSignKey
    );
    const targetUpdates = [];
    const transactions = [];

    for (const recipient of recipients) {
      if (recipient.priceTag && recipient.priceTag > 0) {
        // Check if there is an existing conversation between sender and this recipient
        const { conversations } = await query({
          conversations: {
            participants: {},
            $: {
              where: {
                "participants.id": { $in: [sender.id, recipient.id] },
              },
            },
          },
        });

        // Find if they share a conversation exactly
        const sharesConversation = conversations.some((c) =>
          c.participants.some((p: any) => p.id === sender.id) &&
          c.participants.some((p: any) => p.id === recipient.id)
        );

        if (!sharesConversation) {
          totalCost += recipient.priceTag;
          targetUpdates.push(
            tx.wallets[recipient.wallet?.id || id()].update({
              balance: (recipient.wallet?.balance || 0) + recipient.priceTag,
            }).link({ identity: recipient.id }),
          );
          transactions.push(
            tx.transactions[id()].update({
              amount: recipient.priceTag,
              type: "outreach",
              timestamp: Date.now(),
              status: "completed",
            }).link({ sender: sender.id, receiver: recipient.id }),
          );
        }
      }
    }

    if (totalCost > 0) {
      const senderBalance = sender.wallet?.balance || 0;
      if (senderBalance < totalCost) {
        return { error: "insufficient-balance" as const };
      }
      targetUpdates.push(
        tx.wallets[sender.wallet?.id || id()].update({
          balance: senderBalance - totalCost,
        }).link({ identity: sender.id }),
      );
    }

    if (
      identities.length !==
        Object.keys(publicSignKeyToEncryptedSymmetricKey).length
    ) {
      return { error: "invalid-participants" as const };
    }

    const conversationId = id();

    const allTxs = [
      tx.conversations[conversationId].update({
        title,
        updatedAt: Date.now(),
      }).link({
        participants: identities.map((x) => x.id),
      }),
      ...targetUpdates,
      ...transactions,
      ...identities.map((identity) =>
        tx.keys[id()]
          .update({
            key: publicSignKeyToEncryptedSymmetricKey[
              identity.publicSignKey
            ] as EncryptedConversationKey,
          }).link({ conversation: conversationId, owner: identity.id })
      ),
    ];

    await transact(allTxs);

    return { conversationId };
  };
