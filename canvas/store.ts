import type { Credentials, Json } from "../protocol/src/clientApi.ts";
import { getCanvasRow, saveCanvasSigned } from "../backend/src/api.ts";
import {
  decryptSymmetric,
  type EncryptedSymmetric,
  encryptSymmetric,
} from "../protocol/src/crypto.ts";
import {
  lookupConversationKeyCredentials,
  registerCredentials,
} from "../protocol/src/instantAuth.ts";
import { applyEdit, type CanvasEdit } from "./patch.ts";

export const emptyCanvas = `view = () => {
  return div([
    div([
      badge("prompt2bot", "primary"),
      h1("Setting up your interface..."),
      lead("The AI builder is generating your dynamic live canvas from context.")
    ], "canvas-hero")
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
  credentials?: Credentials,
): Promise<CanvasRow | undefined> => {
  const { row } = await getCanvasRow(conversationId, credentials);
  if (!row || !isEncrypted(row.encrypted)) return undefined;
  return {
    id: row.id,
    encrypted: row.encrypted,
    version: row.version,
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
  credentials,
}: {
  conversationId: string;
  conversationKey: string | undefined;
  credentials?: Credentials;
}): Promise<CanvasRead> => {
  if (credentials) registerCredentials(credentials);
  if (!conversationKey) {
    return {
      ok: false,
      reason: "no-key",
      message: "no access to this conversation's key",
    };
  }
  const creds = credentials ??
    lookupConversationKeyCredentials(conversationKey);
  const row = await findRow(conversationId, creds);
  if (!row) return { ok: true, canvas: { text: emptyCanvas, version: 0 } };
  return decryptRow(conversationKey, row).then(
    (canvas): CanvasRead => ({ ok: true, canvas }),
    (error): CanvasRead => ({
      ok: false,
      reason: "unreadable",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
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
  if (await findRow(conversationId, credentials)) {
    return {
      ok: false,
      reason: "conflict",
      message: "this conversation already has a canvas",
    };
  }
  const encrypted = await encryptSymmetric(conversationKey, text);
  const saved = await saveCanvasSigned({
    conversationId,
    encrypted,
    expectedVersion: 0,
    credentials,
  });
  if (!saved.ok) {
    if (saved.error === "conflict") {
      return {
        ok: false,
        reason: "conflict",
        message: "this conversation already has a canvas",
      };
    }
    return {
      ok: false,
      reason: "rejected",
      message: saved.error,
    };
  }
  return { ok: true, canvas: { text, version: saved.version } };
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
  const row = await findRow(conversationId, credentials);
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
  const encrypted = await encryptSymmetric(conversationKey, applied.text);
  const saved = await saveCanvasSigned({
    conversationId,
    encrypted,
    expectedVersion: current.version,
    credentials,
  });
  if (!saved.ok) {
    if (saved.error === "conflict") {
      const latestText =
        saved.currentEncrypted && isEncrypted(saved.currentEncrypted)
          ? await decryptSymmetric<string>(
            conversationKey,
            saved.currentEncrypted,
          ).catch(() => undefined)
          : undefined;
      return {
        ok: false,
        reason: "conflict",
        message: `the canvas moved to version ${
          saved.currentVersion ?? current.version + 1
        } while you were editing version ${current.version}`,
        currentText: latestText,
        currentVersion: saved.currentVersion,
      };
    }
    return { ok: false, reason: "rejected", message: saved.error };
  }
  return { ok: true, canvas: { text: applied.text, version: saved.version } };
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
