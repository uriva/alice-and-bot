import type { Credentials, Json } from "../protocol/src/clientApi.ts";
import {
  decryptSymmetric,
  type EncryptedSymmetric,
  encryptSymmetric,
} from "../protocol/src/crypto.ts";
import { accessAdminDb } from "../lit/core/instant-client.ts";
import { applyEdit, type CanvasEdit } from "./patch.ts";

export const emptyCanvas = `view = () => {
  return div([
    div([
      badge("prompt2bot", "primary"),
      h1("Build and Configure AI Agents"),
      lead("Autonomous bots across WhatsApp, Telegram, Web chat, and Email.")
    ], "canvas-hero"),
    div([
      card("Customer Support Agent", [
        p("Resolve inquiries 24/7 on WhatsApp & Web with intelligent tool use and escalation."),
        button("Create Support Bot", "create_support_bot")
      ], "canvas-feature-card"),
      card("Personal Assistant", [
        p("Manage tasks, schedule reminders, research the web, and draft emails autonomously."),
        button("Create Assistant", "create_assistant_bot")
      ], "canvas-feature-card"),
      card("Sales & Lead Gen", [
        p("Qualify leads, answer pricing questions, and book calendar appointments automatically."),
        button("Create Sales Bot", "create_sales_bot")
      ], "canvas-feature-card")
    ], "canvas-grid")
  ], "canvas-page")
}
act = (action: string, fields) => {
  return emit(action)
}
`;

export type StoredCanvas = { readonly text: string; readonly version: number };

type CanvasRow = {
  readonly id: string;
  readonly encrypted: EncryptedSymmetric<string>;
  readonly version: number;
};

// InstantDB maps the json<> column through a type whose phantom parameter is
// left unresolved, so the brand has to be recovered before decryptSymmetric
// will take it.
const isEncrypted = (value: unknown): value is EncryptedSymmetric<string> =>
  typeof value === "string";

export type CanvasRead =
  | { readonly ok: true; readonly canvas: StoredCanvas }
  | {
    readonly ok: false;
    readonly reason: "no-key" | "unreadable";
    readonly message: string;
  };

export type CanvasWrite =
  | { readonly ok: true; readonly canvas: StoredCanvas }
  | {
    readonly ok: false;
    readonly reason: "no-key" | "unreadable" | "conflict" | "rejected";
    readonly message: string;
    readonly currentText?: string;
    readonly currentVersion?: number;
  };

const findRow = async (
  conversationId: string,
): Promise<CanvasRow | undefined> => {
  // The conversation must be filtered: without it this scans every conversation
  // in the table, which times out against a live database.
  const { conversations } = await accessAdminDb().query({
    conversations: {
      $: { where: { id: conversationId } },
      canvas: {},
    },
  });
  const rawCanvas = conversations[0]?.canvas;
  const canvas = Array.isArray(rawCanvas) ? rawCanvas[0] : rawCanvas;
  if (!canvas || !isEncrypted(canvas.encrypted)) return undefined;
  return {
    id: canvas.id,
    encrypted: canvas.encrypted,
    version: canvas.version,
  };
};

const decryptRow = async (
  key: string,
  row: CanvasRow,
): Promise<StoredCanvas> => ({
  text: await decryptSymmetric<string>(key, row.encrypted),
  version: row.version,
});

export const readCanvas = async ({
  conversationId,
  conversationKey,
}: {
  conversationId: string;
  conversationKey: string | undefined;
}): Promise<CanvasRead> => {
  if (!conversationKey) {
    return {
      ok: false,
      reason: "no-key",
      message: "no access to this conversation's key",
    };
  }
  const row = await findRow(conversationId);
  if (!row) return { ok: true, canvas: { text: emptyCanvas, version: 0 } };
  try {
    return { ok: true, canvas: await decryptRow(conversationKey, row) };
  } catch (error) {
    return {
      ok: false,
      reason: "unreadable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

// The only way a canvas comes into existence. Called by the auto-landing page
// when it creates a conversation; everywhere else a canvas either already
// exists or does not, which is what lets a host gate a capability on it.
export const createCanvas = async ({
  conversationId,
  conversationKey,
  credentials,
  text = emptyCanvas,
}: {
  conversationId: string;
  conversationKey: string | undefined;
  credentials: Credentials;
  text?: string;
}): Promise<CanvasWrite> => {
  if (!conversationKey) {
    return {
      ok: false,
      reason: "no-key",
      message: "no access to this conversation's key",
    };
  }
  if (await findRow(conversationId)) {
    return {
      ok: false,
      reason: "conflict",
      message: "this conversation already has a canvas",
    };
  }
  const canvasId = crypto.randomUUID();
  await accessAdminDb().transact([
    accessAdminDb().tx.canvases[canvasId].update({
      encrypted: await encryptSymmetric(conversationKey, text),
      version: 1,
      updatedAt: Date.now(),
      updatedBy: credentials.publicSignKey,
    }).link({ conversation: conversationId }),
  ]);
  return { ok: true, canvas: { text, version: 1 } };
};

export const writeCanvas = async ({
  conversationId,
  conversationKey,
  credentials,
  edit,
  baseVersion,
}: {
  conversationId: string;
  conversationKey: string | undefined;
  credentials: Credentials;
  edit: CanvasEdit;
  baseVersion?: number;
}): Promise<CanvasWrite> => {
  if (!conversationKey) {
    return {
      ok: false,
      reason: "no-key",
      message: "no access to this conversation's key",
    };
  }
  const row = await findRow(conversationId);
  const current = row
    ? await decryptRow(conversationKey, row).catch(() => undefined)
    : { text: emptyCanvas, version: 0 };
  if (!current) {
    return {
      ok: false,
      reason: "unreadable",
      message: "the canvas could not be decrypted",
    };
  }
  if (baseVersion !== undefined && baseVersion !== current.version) {
    return {
      ok: false,
      reason: "conflict",
      message:
        `the canvas moved to version ${current.version} while you were editing version ${baseVersion}`,
      currentText: current.text,
      currentVersion: current.version,
    };
  }
  const applied = applyEdit({ text: current.text, edit });
  if (!applied.ok) {
    return { ok: false, reason: "rejected", message: applied.message };
  }
  const version = current.version + 1;
  const db = accessAdminDb();
  const canvasId = row?.id ?? crypto.randomUUID();
  const changes = {
    encrypted: await encryptSymmetric(conversationKey, applied.text),
    version,
    updatedAt: Date.now(),
    updatedBy: credentials.publicSignKey,
  };
  await db.transact(
    row ? db.tx.canvases[canvasId].update(changes) : [
      db.tx.canvases[canvasId].update(changes).link({
        conversation: conversationId,
      }),
    ],
  );
  return { ok: true, canvas: { text: applied.text, version } };
};

export const canvasEvent = (action: string, data: Json) => ({ action, data });

export const canvasQuery = (conversationId: string) => ({
  conversations: {
    $: { where: { id: conversationId } },
    canvas: {},
  },
});

// Decrypting is separated from subscribing so it can be tested directly, and so
// the subscription stays a thin wrapper with no logic to inject.
export const canvasFromRow = (
  row: { readonly encrypted: unknown; readonly version: number } | undefined,
  conversationKey: string | undefined,
): Promise<StoredCanvas | undefined> => {
  if (!row || !conversationKey || !isEncrypted(row.encrypted)) {
    return Promise.resolve(undefined);
  }
  return decryptSymmetric<string>(conversationKey, row.encrypted).then((
    text,
  ) => ({
    text,
    version: row.version,
  }));
};
