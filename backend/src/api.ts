import { typedApiClient } from "typed-api";

export type BackendApi = {
  createConversation: {
    input: { publicSignKeys: string[]; title: string };
    output:
      | { success: true; conversationId: string }
      | {
        success: false;
        error: "invalid-participants" | "must-own-an-identity";
      };
  };
  createIdentity: {
    input: { publicSignKey: string; publicEncryptKey: string };
    output: { success: true };
  };
  // deno-lint-ignore ban-types
  notify: { input: { messageId: string }; output: {} };
  setWebhook: {
    input: { url: string; publicSignKey: string };
    output:
      | { success: true }
      | {
        success: false;
        error: "identity-does-not-exist-or-not-owned";
      };
  };
};

export const apiClient = typedApiClient<BackendApi>(
  "https://alice-and-bot.deno.dev",
);
