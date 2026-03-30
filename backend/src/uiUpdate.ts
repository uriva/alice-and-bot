// deno-lint-ignore-file no-explicit-any
import "./instantCorePolyfill.ts";

import { id } from "@instantdb/admin";
import { init as coreInit } from "@instantdb/core";
import { query, transact, tx } from "./db.ts";
import { instantAppId } from "../../protocol/src/clientApi.ts";

class DummyStorage {
  constructor(_appId: string, _storeName: string) {}
  getItem(_k: string) {
    return Promise.resolve(null);
  }
  setItem(_k: string, _v: any) {
    return Promise.resolve();
  }
  multiSet(_entries: [string, any][]) {
    return Promise.resolve();
  }
  removeItem(_k: string) {
    return Promise.resolve();
  }
  getAllKeys(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

const coreDb = coreInit({ appId: instantAppId }, DummyStorage);

type UiUpdateInput = {
  elementId: string;
  conversationId?: string;
  type?: string;
  text?: string;
  active?: boolean;
  percentage?: number;
  authorId?: string;
};

export const handleUiUpdate = async (
  input: UiUpdateInput,
): Promise<{ success: true } | { error: string }> => {
  const {
    elementId,
    conversationId,
    type,
    text,
    active,
    percentage,
    authorId,
  } = input;
  if (!elementId) return { error: "elementId is required" };

  // For streams, we use ephemeral topics instead of persisting to the database
  if (type === "stream") {
    if (!conversationId) {
      return { error: "conversationId is required for stream" };
    }
    const room = coreDb.joinRoom("conversations", conversationId);
    room.publishTopic("stream", {
      elementId,
      text: text ?? "",
      active: active ?? true,
      authorId,
      updatedAt: Date.now(),
    });
    return { success: true };
  }

  const { uiElements } = await query({
    uiElements: { $: { where: { elementId } } },
  });
  if (uiElements.length === 0) {
    if (active === false) return { success: true };
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
        ...(authorId !== undefined ? { authorId } : {}),
        updatedAt: Date.now(),
      }),
      tx.uiElements[newId].link({ conversation: conversationId }),
    ]);
  } else {
    // Clean up old streams that were persisted before the migration to ephemeral topics
    if (active === false && uiElements[0].type === "stream") {
      await transact(tx.uiElements[uiElements[0].id].delete());
    } else {
      await transact(
        tx.uiElements[uiElements[0].id].update({
          ...(text !== undefined ? { text } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(percentage !== undefined ? { percentage } : {}),
          ...(authorId !== undefined ? { authorId } : {}),
          updatedAt: Date.now(),
        }),
      );
    }
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
