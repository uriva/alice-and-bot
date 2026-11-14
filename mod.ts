import {
  getConversationInfo as backendGetConversationInfo,
  getConversations as backendGetConversations,
  getMessagesSigned as backendGetMessages,
  getProfile as backendGetProfile,
} from "./backend/src/api.ts";
import type { GetMessagesResult } from "./backend/src/api.ts";
import {
  createConversation as createConversationNoDb,
  type Credentials,
  type DecipheredMessage,
  decryptMessage,
  type EncryptedMessage,
  getConversationKey,
  publicSignKeyToAlias as publicSignKeyToAliasNoDb,
} from "./protocol/src/clientApi.ts";
import { accessAdminDb } from "./lit/core/instant-client.ts";
import type { WidgetParams } from "./widget/src/widget.ts";
export {
  aliasToPublicSignKey,
  getUploadUrl,
  sendTyping,
  setWebhook,
} from "./backend/src/api.ts";
export type { GetMessagesResult } from "./backend/src/api.ts";
export {
  type Attachment,
  type AudioAttachment,
  buildUiUpdateUrl,
  chatWithMeLink,
  createIdentity,
  type Credentials,
  type DecipheredMessage,
  downloadAttachment,
  type FileAttachment,
  fileSizeLimits,
  generateTransferUrl,
  getConversationKey,
  handleWebhookUpdate,
  type ImageAttachment,
  type LocationAttachment,
  parseChatWithUrl,
  renameConversation,
  resolveHandle,
  sendMessage,
  sendMessageWithKey,
  setAlias,
  setAvatar,
  setName,
  uiUpdateUrl,
  uploadAttachment,
  type VideoAttachment,
  type WebhookUpdate,
} from "./protocol/src/clientApi.ts";
export {
  maxEncryptedMessageLength,
  maxTextLength,
} from "./protocol/src/attachmentLimits.ts";
export {
  shortIdFromPublicSignKey,
  shortIdLength,
} from "./protocol/src/shortId.ts";
export {
  defaultWebhookServerPublicKey,
  resetSeenWebhookMessages,
  signWebhookOrigin,
  verifyWebhookOrigin,
} from "./protocol/src/webhookAuth.ts";
export { setDarkModeOverride } from "./lit/core/dark-mode.ts";
export {
  type Conversation,
  getOrCreateConversation,
  subscribeConversations,
  subscribeIdentityProfile,
} from "./lit/core/subscriptions.ts";
export {
  loadCredentials,
  loadOrCreateCredentials,
  saveCredentials,
} from "./lit/core/credentials.ts";
export {
  compactPublicKey,
  useConversationKey,
  useConversations,
  useCredentials,
  useDarkMode,
  useDecryptedMessages,
  useEphemeralStreams,
  useGetOrCreateConversation,
  useIdentityDetailsMap,
  useIdentityProfile,
  useIsMobile,
  useTypingPresence,
  useUserName,
} from "./lit/react-hooks.ts";
export type { DarkModeOverride } from "./lit/core/dark-mode.ts";
export type { EphemeralStreamEvent } from "./lit/core/room.ts";
export type { SuggestedMessage } from "./lit/components/types.ts";

export const publicSignKeyToAlias = (publicSignKey: string): Promise<
  { alias: string } | { error: "no-such-identity" | "no-alias" }
> => publicSignKeyToAliasNoDb(publicSignKey);

export const getProfile = async (publicSignKey: string): Promise<
  {
    name?: string;
    avatar?: string;
    alias?: string;
    priceTag?: number;
  } | null
> => {
  const { profile } = await backendGetProfile(publicSignKey);
  return profile;
};

export const createConversation: (
  publicSignKeys: string[],
  conversationTitle: string,
  credentials: Credentials,
) => Promise<{ conversationId: string } | { error: string }> =
  createConversationNoDb(accessAdminDb);

export const getConversations = async (
  publicSignKeys: string[],
  credentials?: Credentials,
): Promise<{
  id: string;
  title: string;
  participants: {
    publicSignKey: string;
  }[];
}[]> => {
  const { conversations } = await backendGetConversations(
    publicSignKeys,
    credentials,
  );
  return conversations;
};

export const getConversationInfo = (
  conversationId: string,
  credentials?: Credentials,
): Promise<
  | {
    conversationInfo: {
      participants: {
        publicSignKey: string;
        name?: string;
        avatar?: string;
        alias?: string;
      }[];
      isPartial: boolean;
      hasCanvas: boolean;
    };
  }
  | { error: "not-found" }
> => backendGetConversationInfo(conversationId, credentials);

export const getMessages = ({
  conversationId,
  limit,
  before,
  credentials,
}: {
  conversationId: string;
  limit?: number;
  before?: number;
  credentials: Credentials;
}): Promise<GetMessagesResult> =>
  backendGetMessages({ conversationId, limit, before, credentials });

export const getDecryptedMessages = async ({
  conversationId,
  limit,
  before,
  credentials,
}: {
  conversationId: string;
  limit?: number;
  before?: number;
  credentials: Credentials;
}): Promise<
  | {
    messages: DecipheredMessage[];
    hasMore: boolean;
  }
  | { error: "not-participant" | "invalid-auth" }
> => {
  const [convKey, result, infoResult] = await Promise.all([
    getConversationKey(credentials, conversationId),
    backendGetMessages({
      conversationId,
      limit,
      before,
      credentials,
    }),
    backendGetConversationInfo(conversationId, credentials),
  ]);
  if ("error" in result) return result;
  const allowedParticipantKeys =
    !("error" in infoResult) && !infoResult.conversationInfo.isPartial
      ? new Set(
        infoResult.conversationInfo.participants.map((p) => p.publicSignKey),
      )
      : undefined;
  const decrypted = await Promise.all(
    result.messages.map((m) =>
      decryptMessage(convKey, { conversationId, allowedParticipantKeys })({
        ...m,
        payload: m.payload as EncryptedMessage,
      })
    ),
  );
  const valid = decrypted.filter((m): m is NonNullable<typeof m> =>
    m !== undefined
  );
  const originals = new Map(
    valid
      .filter((m) => m.type === "text")
      .map((m) => [m.id, m] as const),
  );
  return {
    messages: valid.filter((m) => {
      if (m.type !== "edit") return true;
      const orig = originals.get(m.editOf);
      if (!orig) return true;
      return m.publicSignKey === orig.publicSignKey &&
        m.timestamp >= orig.timestamp;
    }),
    hasMore: result.hasMore,
  };
};

export const embedScript = (params: WidgetParams): string => `
<script type="application/json" id="alice-and-bot-params">
  ${JSON.stringify(params)}
</script>
<script>
  const widgetParams = JSON.parse(document.getElementById('alice-and-bot-params').textContent);
  const s = document.createElement('script');
  s.src = "https://storage.googleapis.com/alice-and-bot/widget/dist/widget.iife.js?v=378";
  s.async = true;
  s.onload = () => aliceAndBot.loadChatWidget(widgetParams);
  document.head.appendChild(s);
</script>`;
