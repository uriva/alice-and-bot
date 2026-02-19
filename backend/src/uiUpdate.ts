import { id } from "@instantdb/admin";
import { query, transact, tx } from "./db.ts";

type UiUpdateInput = {
  elementId: string;
  conversationId?: string;
  type?: string;
  text?: string;
  active?: boolean;
  percentage?: number;
};

export const handleUiUpdate = async (
  input: UiUpdateInput,
): Promise<{ success: true } | { error: string }> => {
  const { elementId, conversationId, type, text, active, percentage } = input;
  if (!elementId) return { error: "elementId is required" };
  const { uiElements } = await query({
    uiElements: { $: { where: { elementId } } },
  });
  if (uiElements.length === 0) {
    if (!conversationId || !type) {
      return {
        error:
          "element not found (provide conversationId and type to auto-create)",
      };
    }
    const newId = id();
    await transact([
      tx.uiElements[newId].update({
        elementId,
        type,
        ...(text !== undefined ? { text } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(percentage !== undefined ? { percentage } : {}),
        updatedAt: Date.now(),
      }),
      tx.uiElements[newId].link({ conversation: conversationId }),
    ]);
  } else {
    await transact(
      tx.uiElements[uiElements[0].id].update({
        ...(text !== undefined ? { text } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(percentage !== undefined ? { percentage } : {}),
        updatedAt: Date.now(),
      }),
    );
  }
  if (Math.random() < 0.1) {
    const cutoff = Date.now() - 3600_000;
    const { uiElements: stale } = await query({
      uiElements: { $: { where: { updatedAt: { $lt: cutoff } } } },
    });
    await Promise.all(
      stale.map((el: { id: string }) =>
        transact(tx.uiElements[el.id].delete())
      ),
    );
  }
  return { success: true };
};
