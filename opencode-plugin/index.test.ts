import { assertEquals } from "@std/assert";
import { isKnownPluginCommand, isReplyCommand } from "./commands.ts";
import { newSessionMessage, switchSessionMessage } from "./links.ts";
import { executeTuiAction, executeTuiCommand } from "./tui.ts";
import {
  findPendingPermissionForConvo,
  permissionReplyForCommand,
} from "./permissions.ts";
import { promptWasAcceptedDespiteError } from "./prompt.ts";
import {
  answersFromQuestionReplyText,
  formatQuestionRequest,
} from "./question.ts";
import { reasoningStreamUpdate } from "./reasoning.ts";
import {
  isRecentDuplicate,
  isWebhookEnvelope,
  recentPromptFingerprint,
} from "./relay.ts";

Deno.test("reasoningStreamUpdate turns reasoning into transient stream updates", () => {
  assertEquals(
    reasoningStreamUpdate({
      conversationId: "conversation-1",
      part: {
        id: "part-1",
        type: "reasoning",
        text: "thinking aloud",
        time: { end: 1 },
      },
      publicSignKey: "bot-key",
    }),
    {
      active: false,
      authorId: "bot-key",
      conversationId: "conversation-1",
      elementId: "opencode-reasoning-part-1",
      text: "thinking aloud",
      type: "stream",
    },
  );
});

Deno.test("isWebhookEnvelope ignores relay pong messages", () => {
  assertEquals(isWebhookEnvelope({ type: "pong" }), false);
});

Deno.test("isWebhookEnvelope accepts encrypted message envelopes", () => {
  assertEquals(
    isWebhookEnvelope({
      conversationId: "conversation-1",
      messageId: "message-1",
      payload: "ciphertext",
    }),
    true,
  );
});

Deno.test("recentPromptFingerprint matches repeated relay deliveries with new ids", () => {
  assertEquals(
    recentPromptFingerprint({
      conversationId: "conversation-1",
      message: { text: " hello ", attachments: [] },
    }),
    recentPromptFingerprint({
      conversationId: "conversation-1",
      message: { text: "hello", attachments: [] },
    }),
  );
});

Deno.test("isRecentDuplicate only matches inside the prompt dedupe window", () => {
  assertEquals(
    isRecentDuplicate({ now: 1100, previousTimestamp: 1000, windowMs: 500 }),
    true,
  );
  assertEquals(
    isRecentDuplicate({ now: 1600, previousTimestamp: 1000, windowMs: 500 }),
    false,
  );
});

Deno.test("promptWasAcceptedDespiteError detects empty JSON response parse errors", () => {
  assertEquals(
    promptWasAcceptedDespiteError(
      new Error("JSON Parse error: Unexpected EOF"),
    ),
    true,
  );
});

Deno.test("formatQuestionRequest renders numbered choices for phone replies", () => {
  assertEquals(
    formatQuestionRequest({
      id: "question-1",
      questions: [{
        header: "Pick One",
        question: "What should I do?",
        options: [
          { label: "Continue", description: "Proceed" },
          { label: "Stop" },
        ],
      }],
    }),
    "Pick One\nWhat should I do?\n1. Continue - Proceed\n2. Stop\n\nReply with a number, or send any other message to cancel this choice and continue with that message.",
  );
});

Deno.test("answersFromQuestionReplyText maps numeric replies to labels", () => {
  assertEquals(
    answersFromQuestionReplyText({
      id: "question-1",
      questions: [{
        header: "Pick One",
        question: "What should I do?",
        options: [{ label: "Continue" }, { label: "Stop" }],
      }],
    }, "2"),
    [["Stop"]],
  );
});

Deno.test("answersFromQuestionReplyText ignores free text replies", () => {
  assertEquals(
    answersFromQuestionReplyText({
      id: "question-1",
      questions: [{
        header: "Pick One",
        question: "What should I do?",
        options: [{ label: "Continue" }, { label: "Stop" }],
      }],
    }, "do something else"),
    undefined,
  );
});

Deno.test("permissionReplyForCommand maps reply commands to permission verbs", () => {
  assertEquals(permissionReplyForCommand("/always"), "always");
  assertEquals(permissionReplyForCommand("/YES"), "once");
  assertEquals(permissionReplyForCommand("/no"), "reject");
  assertEquals(permissionReplyForCommand("/sessions"), undefined);
});

Deno.test("findPendingPermissionForConvo finds pending permission after session switch", () => {
  const pending = [
    {
      requestId: "req-1",
      sessionId: "ses-old",
      conversationId: "convo-1",
      description: "read",
    },
  ];
  assertEquals(
    findPendingPermissionForConvo({
      pending,
      conversationId: "convo-1",
      sessionId: "ses-new",
    })?.requestId,
    "req-1",
  );
});

Deno.test("findPendingPermissionForConvo prefers exact session match", () => {
  const pending = [
    {
      requestId: "req-1",
      sessionId: "ses-1",
      conversationId: "convo-1",
      description: "read",
    },
    {
      requestId: "req-2",
      sessionId: "ses-2",
      conversationId: "convo-1",
      description: "write",
    },
  ];
  assertEquals(
    findPendingPermissionForConvo({
      pending,
      conversationId: "convo-1",
      sessionId: "ses-2",
    })?.requestId,
    "req-2",
  );
});

Deno.test("isKnownPluginCommand recognises plugin slash commands", () => {
  assertEquals(isKnownPluginCommand("/sessions"), true);
  assertEquals(isKnownPluginCommand("/switch"), true);
  assertEquals(isKnownPluginCommand("/always"), false);
  assertEquals(isKnownPluginCommand("/unknown"), false);
});

Deno.test("isReplyCommand recognises permission/question replies", () => {
  assertEquals(isReplyCommand("/always"), true);
  assertEquals(isReplyCommand("/YES"), true);
  assertEquals(isReplyCommand("/sessions"), false);
});

Deno.test("executeTuiAction preserves this on tui methods", async () => {
  const tui = {
    _client: { ok: true },
    openModels() {
      if (this !== tui) throw new Error("this lost");
      return { invoked: this._client.ok };
    },
  };
  const client = { tui };
  assertEquals(await executeTuiAction({ client, action: "openModels" }), true);
});

Deno.test("executeTuiCommand preserves this on executeCommand", async () => {
  const calls: string[] = [];
  const tui = {
    _client: {},
    executeCommand({ command }: { command: string }) {
      if (this !== tui) throw new Error("this lost");
      calls.push(command);
    },
  };
  assertEquals(
    await executeTuiCommand({ client: { tui }, command: "/help" }),
    true,
  );
  assertEquals(calls, ["/help"]);
});

Deno.test("executeTuiAction returns false when method missing", async () => {
  assertEquals(
    await executeTuiAction({ client: { tui: {} }, action: "openModels" }),
    false,
  );
});

Deno.test("newSessionMessage renders markdown link", () => {
  assertEquals(
    newSessionMessage({ url: "https://aliceandbot.com/chat?x=1" }),
    "New session started. [Open chat](https://aliceandbot.com/chat?x=1)",
  );
});

Deno.test("switchSessionMessage renders markdown link with code", () => {
  assertEquals(
    switchSessionMessage({ url: "https://example.com/c", code: "a1" }),
    "Open this link to start a chat tied to session a1: [Open chat](https://example.com/c)",
  );
});
