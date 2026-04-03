import type { Page, Route } from "@playwright/test";
import type { TestData } from "./test-data.ts";
import { randomUUID } from "node:crypto";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const emptyPayload: Record<string, unknown> = {};
const emptyBody = { endpoint: "", payload: emptyPayload };

const parseBody = (raw: string | null): { endpoint: string; payload: Record<string, unknown> } => {
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (!isRecord(parsed)) return emptyBody;
    return {
      endpoint: str(parsed.endpoint),
      payload: isRecord(parsed.payload) ? parsed.payload : {},
    };
  } catch {
    return emptyBody;
  }
};

export type SentMessage = { conversation: string; encryptedMessage: string };

export const setupBackendApiMock = async (page: Page, data: TestData) => {
  const sentMessages: SentMessage[] = [];

  await page.route("**/api.aliceandbot.com/**", async (route: Route) => {
    const { endpoint, payload } = parseBody(route.request().postData());

    if (endpoint === "issueNonce") {
      await delay(50);
      return route.fulfill(json({ nonce: randomUUID() }));
    }
    if (endpoint === "conversationKey") {
      await delay(100);
      return route.fulfill(json({ conversationKey: data.aliceEncryptedKey }));
    }
    if (endpoint === "sendMessage") {
      await delay(150);
      const conversation = str(payload.conversation);
      const encryptedMessage = str(payload.encryptedMessage);
      if (!conversation || !encryptedMessage) {
        return route.fulfill(json({ error: "missing conversation or encryptedMessage" }, 400));
      }
      sentMessages.push({ conversation, encryptedMessage });
      return route.fulfill(json({ messageId: randomUUID() }));
    }
    if (endpoint === "createAnonymousIdentity") {
      await delay(100);
      return route.fulfill(json({}));
    }
    if (endpoint === "getProfile") {
      await delay(50);
      return route.fulfill(json({ profile: { name: "Alice", alias: "alice" } }));
    }
    if (endpoint === "aliasToPublicSignKey") {
      await delay(50);
      return route.fulfill(json({ publicSignKey: data.bob.publicSignKey }));
    }
    if (endpoint === "createConversation") {
      await delay(200);
      return route.fulfill(json({ conversationId: data.conversationId }));
    }
    if (endpoint === "getConversationInfo") {
      await delay(50);
      return route.fulfill(json({
        conversationInfo: {
          participants: [
            { publicSignKey: data.alice.publicSignKey, name: "Alice" },
            { publicSignKey: data.bob.publicSignKey, name: "Bob" },
          ],
          isPartial: false,
        },
      }));
    }
    if (endpoint === "sendTyping") {
      return route.fulfill(json({ success: true }));
    }
    if (endpoint === "getUploadUrl") {
      await delay(100);
      return route.fulfill(json({
        uploadUrl: "https://storage.googleapis.com/fake-bucket/upload",
        fileUrl: "https://storage.googleapis.com/fake-bucket/file.bin",
        maxSize: 10_000_000,
      }));
    }
    if (endpoint === "getConversations") {
      await delay(100);
      return route.fulfill(json({
        conversations: [{
          id: data.conversationId,
          title: "Test Conversation",
          participants: [
            { publicSignKey: data.alice.publicSignKey },
            { publicSignKey: data.bob.publicSignKey },
          ],
        }],
      }));
    }
    if (endpoint === "publicSignKeyToAlias") {
      await delay(50);
      return route.fulfill(json({ alias: "alice" }));
    }

    return route.fulfill(json({ error: "unknown-endpoint" }, 404));
  });

  return { sentMessages };
};
