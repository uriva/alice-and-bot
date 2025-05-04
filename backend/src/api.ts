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
};

export const apiClient = typedApiClient<BackendApi>(
  "https://alice-and-bot-notification-service.deno.dev",
);
