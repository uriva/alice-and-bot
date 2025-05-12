import { apiClient as apiClientMaker } from "typed-api";
import { EncryptedConversationKey } from "../../protocol/src/api.ts";

export type BackendApi = {
  createConversation: {
    authRequired: true;
    input: {
      publicSignKeyToEncryptedSymmetricKey: Record<
        string,
        EncryptedConversationKey
      >;
      title: string;
    };
    output:
      | { success: true; conversationId: string }
      | {
        success: false;
        error: "invalid-participants" | "must-own-an-identity";
      };
  };
  createAccount: {
    authRequired: true;
    // deno-lint-ignore ban-types
    input: {};
    output: { success: true; accountId: string; accessToken: string };
  };
  createIdentityUsingToken: {
    authRequired: false;
    input: {
      accessToken: string;
      publicSignKey: string;
      publicEncryptKey: string;
    };
    output:
      | { success: true }
      | { success: false; error: "invalid-access-token" };
  };
  createIdentity: {
    authRequired: true;
    input: { publicSignKey: string; publicEncryptKey: string };
    output: { success: true };
  };
  // deno-lint-ignore ban-types
  notify: { authRequired: true; input: { messageId: string }; output: {} };
  setWebhook: {
    authRequired: true;
    input: { url: string; publicSignKey: string };
    output:
      | { success: true }
      | {
        success: false;
        error: "identity-does-not-exist-or-not-owned";
      };
  };
};

export const apiClient = apiClientMaker<BackendApi>(
  "https://alice-and-bot.deno.dev",
);
