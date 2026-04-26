import {
  getConversationInfo as backendGetConversationInfo,
  getConversations as backendGetConversations,
  getProfile as backendGetProfile,
} from "./backend/src/api.ts";
import {
  createConversation as createConversationNoDb,
  type Credentials,
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
export {
  type Attachment,
  type AudioAttachment,
  buildUiUpdateUrl,
  chatWithMeLink,
  createIdentity,
  type Credentials,
  downloadAttachment,
  type FileAttachment,
  fileSizeLimits,
  handleWebhookUpdate,
  type ImageAttachment,
  type LocationAttachment,
  renameConversation,
  sendMessage,
  sendMessageWithKey,
  setAlias,
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

export const publicSignKeyToAlias = (publicSignKey: string): Promise<
  { alias: string } | { error: "no-such-identity" | "no-alias" }
> => publicSignKeyToAliasNoDb(publicSignKey);

export const getProfile = async (publicSignKey: string): Promise<
  {
    name?: string;
    avatar?: string;
    alias?: string;
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

export const getConversations = async (publicSignKeys: string[]): Promise<{
  id: string;
  title: string;
  participants: {
    publicSignKey: string;
  }[];
}[]> => {
  const { conversations } = await backendGetConversations(publicSignKeys);
  return conversations;
};

export const getConversationInfo = (conversationId: string): Promise<
  | {
    conversationInfo: {
      participants: {
        publicSignKey: string;
        name?: string;
        avatar?: string;
        alias?: string;
      }[];
      isPartial: boolean;
    };
  }
  | { error: "not-found" }
> => backendGetConversationInfo(conversationId);

export const embedScript = (params: WidgetParams): string => `
<script type="application/json" id="alice-and-bot-params">
  ${JSON.stringify(params)}
</script>
<script>
  const widgetParams = JSON.parse(document.getElementById('alice-and-bot-params').textContent);
  const s = document.createElement('script');
  s.src = "https://storage.googleapis.com/alice-and-bot/widget/dist/widget.iife.js";
  s.async = true;
  s.onload = () => aliceAndBot.loadChatWidget(widgetParams);
  document.head.appendChild(s);
</script>`;
