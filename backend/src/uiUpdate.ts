// deno-lint-ignore-file no-explicit-any
import "./instantCorePolyfill.ts";

import { id } from "@instantdb/admin";
import { init as coreInit } from "@instantdb/core";
import { instantAppId } from "../../protocol/src/clientApi.ts";
import { verifyAuthToken } from "./auth.ts";
import { query, transact, tx } from "./db.ts";

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

export const maxUiUpdateTextLength = 32_768;
const maxElementIdLength = 256;

export type UiUpdateAuth = {
  publicSignKey: string;
  nonce: string;
  authToken: string;
};

type UiUpdateInput = {
  elementId: string;
  conversationId?: string;
  type?: string;
  text?: string;
  active?: boolean;
  percentage?: number;
  authorId?: string;
  auth?: UiUpdateAuth;
};

export type UiUpdateResult =
  | { success: true; status?: 200 }
  | { error: string; status?: 400 | 401 | 403 };

const verifyParticipant = async (
  conversationId: string,
  publicSignKey: string,
): Promise<boolean> => {
  const { conversations } = await query({
    conversations: {
      participants: {},
      $: { where: { id: conversationId } },
    },
  });
  if (conversations.length === 0) return false;
  return conversations[0].participants.some(
    (p: { publicSignKey: string }) => p.publicSignKey === publicSignKey,
  );
};

export const handleUiUpdate = async (
  input: UiUpdateInput,
): Promise<UiUpdateResult> => {
  const {
    elementId,
    conversationId,
    type,
    text,
    active,
    percentage,
    authorId,
    auth,
  } = input;
  if (!elementId || typeof elementId !== "string") {
    return { error: "elementId is required", status: 400 };
  }
  if (elementId.length > maxElementIdLength) {
    return { error: "elementId exceeds maximum length", status: 400 };
  }
  if (text !== undefined && typeof text !== "string") {
    return { error: "text must be a string", status: 400 };
  }
  if (text !== undefined && text.length > maxUiUpdateTextLength) {
    return { error: "text exceeds maximum length", status: 400 };
  }

  if (auth !== undefined) {
    if (
      !auth ||
      typeof auth.publicSignKey !== "string" ||
      typeof auth.nonce !== "string" ||
      typeof auth.authToken !== "string"
    ) {
      return { error: "invalid-auth", status: 401 };
    }
    const payloadWithoutAuth = {
      elementId,
      ...(conversationId !== undefined ? { conversationId } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(percentage !== undefined ? { percentage } : {}),
      ...(authorId !== undefined ? { authorId } : {}),
    };
    const authOk = await verifyAuthToken({
      action: "uiUpdate",
      payload: payloadWithoutAuth,
      publicSignKey: auth.publicSignKey,
      nonce: auth.nonce,
      authToken: auth.authToken,
    });
    if (!authOk) {
      return { error: "invalid-auth", status: 401 };
    }
    if (authorId !== undefined && authorId !== auth.publicSignKey) {
      return { error: "invalid-auth", status: 401 };
    }
    if (conversationId) {
      const allowed = await verifyParticipant(
        conversationId,
        auth.publicSignKey,
      );
      if (!allowed) {
        return { error: "not-participant", status: 403 };
      }
    }
  }

  if (type === "stream") {
    if (!conversationId) {
      return { error: "conversationId is required for stream", status: 400 };
    }
    const room = coreDb.joinRoom("conversations", conversationId);
    room.publishTopic("stream", {
      elementId,
      text: text ?? "",
      active: active ?? true,
      authorId: auth?.publicSignKey ?? authorId,
      updatedAt: Date.now(),
    });
    return { success: true };
  }

  const { uiElements } = await query({
    uiElements: {
      conversation: {},
      $: { where: { elementId } },
    },
  });
  if (uiElements.length === 0) {
    if (active === false) return { success: true };
    if (!conversationId || !type) {
      return {
        error:
          "element not found (provide conversationId and type to auto-create)",
        status: 400,
      };
    }
    const newId = id();
    const resolvedAuthorId = auth?.publicSignKey ?? authorId;
    await transact([
      tx.uiElements[newId].update({
        elementId,
        type,
        ...(text !== undefined ? { text } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(percentage !== undefined ? { percentage } : {}),
        ...(resolvedAuthorId !== undefined
          ? { authorId: resolvedAuthorId }
          : {}),
        updatedAt: Date.now(),
      }),
      tx.uiElements[newId].link({ conversation: conversationId }),
    ]);
  } else {
    const existingConvId = uiElements[0].conversation?.id;
    if (auth && existingConvId) {
      const allowed = await verifyParticipant(
        existingConvId,
        auth.publicSignKey,
      );
      if (!allowed) return { error: "not-participant", status: 403 };
    }
    if (active === false && uiElements[0].type === "stream") {
      await transact(tx.uiElements[uiElements[0].id].delete());
    } else {
      const resolvedAuthorId = auth?.publicSignKey ?? authorId;
      await transact(
        tx.uiElements[uiElements[0].id].update({
          ...(text !== undefined ? { text } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(percentage !== undefined ? { percentage } : {}),
          ...(resolvedAuthorId !== undefined
            ? { authorId: resolvedAuthorId }
            : {}),
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
