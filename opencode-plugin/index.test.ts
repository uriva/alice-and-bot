import { assertEquals } from "@std/assert";
import { promptWasAcceptedDespiteError } from "./prompt.ts";
import {
  answersFromQuestionReplyText,
  formatQuestionRequest,
} from "./question.ts";
import { reasoningStreamUpdate } from "./reasoning.ts";
import { isWebhookEnvelope } from "./relay.ts";

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
