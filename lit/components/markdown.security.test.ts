import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { parseChatWithUrl } from "../../protocol/src/clientApi.ts";
import { renderMarkdown } from "./markdown.ts";

if (typeof Reflect.get(globalThis, "Element") === "undefined") {
  const dummyElement = function () {};
  Reflect.set(dummyElement.prototype, "replaceChildren", () => {});
  Reflect.set(globalThis, "Element", dummyElement);
  Reflect.set(globalThis, "HTMLElement", dummyElement);
  Reflect.set(globalThis, "customElements", {
    get: () => undefined,
    define: () => {},
  });
}
if (typeof Reflect.get(globalThis, "requestAnimationFrame") === "undefined") {
  Reflect.set(
    globalThis,
    "requestAnimationFrame",
    (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16),
  );
}

const { confirmPaidOutreach, processChatState } = await import(
  "./connected-chat.ts"
);
const {
  isSafeAttachmentSourceUrl,
  isSafeDecryptedMediaUrl,
  sanitizeDownloadFilename,
} = await import("./chat-attachment.ts");

Deno.test("renderMarkdown blocks javascript:, vbscript:, data:, and protocol-relative links", () => {
  const payloads = [
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](java\tscript:alert(1))",
    "[click](\u0001javascript:alert(1))",
    "[click](vbscript:msgbox(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    "[click](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)",
    "[click](//evil.com/phish)",
  ];
  payloads.forEach((md) => {
    const html = renderMarkdown(md, "#222", false);
    assertFalse(
      html.includes("<a "),
      `Expected no <a> tag for unsafe link: ${md}, got: ${html}`,
    );
    assertFalse(html.toLowerCase().includes('href="javascript:'));
    assertFalse(html.toLowerCase().includes('href="vbscript:'));
    assertFalse(html.toLowerCase().includes('href="data:'));
    assertFalse(html.includes("<script"));
  });
});

Deno.test("renderMarkdown allows safe https:, http:, mailto:, and single-slash relative links", () => {
  assertStringIncludes(
    renderMarkdown("[ok](https://aliceandbot.com/docs)", "#222", false),
    'href="https://aliceandbot.com/docs"',
  );
  assertStringIncludes(
    renderMarkdown("[mail](mailto:hi@aliceandbot.com)", "#222", false),
    'href="mailto:hi@aliceandbot.com"',
  );
  assertStringIncludes(
    renderMarkdown("[rel](/chat?chatWith=abc)", "#222", false),
    'href="/chat?chatWith=abc"',
  );
});

Deno.test("renderMarkdown escapes double quotes and angle brackets in img alt, src, video, audio, code lang, and quick-reply buttons", () => {
  const imgBreakout = renderMarkdown(
    '![x" onerror="alert(1)](https://example.com/pic.png)',
    "#222",
    false,
  );
  assertFalse(imgBreakout.includes('onerror="alert(1)"'));
  assertStringIncludes(imgBreakout, "&quot;");

  const btnBreakout = renderMarkdown(
    `Choose:\n<button id='x" onclick="alert(1)'>Click <b>me</b></button>`,
    "#222",
    false,
  );
  assertFalse(btnBreakout.includes('onclick="alert(1)"'));
  assertStringIncludes(btnBreakout, "x&quot; onclick=&quot;alert(1)");

  const codeLangBreakout = renderMarkdown(
    '```"><img src=x onerror=alert(1)>\nconst a = 1;\n```',
    "#222",
    false,
  );
  assertFalse(codeLangBreakout.includes("<img"));

  const videoBreakout = renderMarkdown(
    '![video](https://example.com/v.mp4" onmouseover="alert(1))',
    "#222",
    false,
  );
  assertFalse(videoBreakout.includes('onmouseover="alert(1)"'));

  const audioBreakout = renderMarkdown(
    '![audio](https://example.com/a.mp3" onmouseover="alert(1))',
    "#222",
    false,
  );
  assertFalse(audioBreakout.includes('onmouseover="alert(1)"'));

  const htmlCommentBreakout = renderMarkdown(
    "<!--><svg onload=alert(1)>-->hello",
    "#222",
    false,
  );
  assertFalse(htmlCommentBreakout.includes("<svg"));
});

Deno.test("parseChatWithUrl rejects protocol-relative URLs // and /\\", () => {
  assertEquals(parseChatWithUrl("//evil.com/chat?chatWith=bot123"), null);
  assertEquals(parseChatWithUrl("/\\evil.com/chat?chatWith=bot123"), null);
  assertEquals(
    parseChatWithUrl("javascript://aliceandbot.com/%0aalert(1)?chatWith=bot"),
    null,
  );
  assertEquals(parseChatWithUrl("/chat?chatWith=bot123"), {
    chatWith: "bot123",
    topic: undefined,
  });
});

Deno.test("processChatState rejects cross-author edit forgery and backdated edits", () => {
  const state = processChatState({
    messages: [
      {
        id: "msg-1",
        type: "text",
        text: "Send $10 to Alice",
        publicSignKey: "pk-alice",
        timestamp: 1000,
      },
      {
        id: "edit-forged",
        type: "edit",
        editOf: "msg-1",
        text: "Send $10,000 to Eve",
        publicSignKey: "pk-eve",
        timestamp: 1500,
      },
      {
        id: "edit-backdated",
        type: "edit",
        editOf: "msg-1",
        text: "Backdated edit",
        publicSignKey: "pk-alice",
        timestamp: 500,
      },
    ],
    details: {
      "pk-alice": { name: "Alice" },
      "pk-eve": { name: "Eve" },
    },
    uiElements: [],
    ephemeralStreams: [],
    progressMax: new Map(),
  });

  assertEquals(state.chatMessages.length, 1);
  assertEquals(state.chatMessages[0].text, "Send $10 to Alice");
  assertEquals(state.chatMessages[0].editHistory, undefined);
});

Deno.test("processChatState applies legitimate same-author edit with timestamp >= original", () => {
  const state = processChatState({
    messages: [
      {
        id: "msg-1",
        type: "text",
        text: "Original text",
        publicSignKey: "pk-alice",
        timestamp: 1000,
      },
      {
        id: "edit-valid",
        type: "edit",
        editOf: "msg-1",
        text: "Updated by Alice",
        publicSignKey: "pk-alice",
        timestamp: 1200,
      },
    ],
    details: { "pk-alice": { name: "Alice" } },
    uiElements: [],
    ephemeralStreams: [],
    progressMax: new Map(),
  });

  assertEquals(state.chatMessages.length, 1);
  assertEquals(state.chatMessages[0].text, "Updated by Alice");
  assertEquals(state.chatMessages[0].editHistory?.length, 1);
});

Deno.test("widget start button assigns buttonText via textContent rather than innerHTML", async () => {
  const code = await Deno.readTextFile("./widget/src/widget.ts");
  assertFalse(code.includes("startBtn.innerHTML = buttonText"));
  assertStringIncludes(code, "startBtn.textContent = buttonText");
});

Deno.test("[HIGH-07] confirmPaidOutreach prompts user when priceTag > 0 and aborts on cancel", async () => {
  const prompts: string[] = [];
  const declined = await confirmPaidOutreach(
    "pk-paid-bot",
    "pk-me",
    () => Promise.resolve({ profile: { priceTag: 250 } }),
    (msg) => {
      prompts.push(msg);
      return false;
    },
  );
  assertEquals(declined, false);
  assertEquals(prompts, ["This outreach will cost $2.50. Proceed?"]);

  const freeOk = await confirmPaidOutreach(
    "pk-free-bot",
    "pk-me",
    () => Promise.resolve({ profile: { priceTag: 0 } }),
    () => {
      throw new Error("Should not prompt for free profile");
    },
  );
  assertEquals(freeOk, true);
});

Deno.test("[HIGH-03] processChatState drops messages signed by non-participants when allowedParticipantKeys is provided", () => {
  const state = processChatState({
    messages: [
      {
        id: "m-legit",
        type: "text",
        text: "Hello from Alice",
        publicSignKey: "pk-alice",
        timestamp: 1000,
      },
      {
        id: "m-outsider",
        type: "text",
        text: "Injected by outsider",
        publicSignKey: "pk-outsider",
        timestamp: 1100,
      },
    ],
    details: {
      "pk-alice": { name: "Alice" },
      "pk-outsider": { name: "Outsider" },
    },
    uiElements: [],
    ephemeralStreams: [],
    progressMax: new Map(),
    allowedParticipantKeys: new Set(["pk-alice", "pk-bob"]),
  });
  assertEquals(state.chatMessages.length, 1);
  assertEquals(state.chatMessages[0].text, "Hello from Alice");
});

Deno.test("[MEDIUM-01] chat-attachment validates storage source URLs, decrypted media schemes, and download filenames", () => {
  assertEquals(
    isSafeAttachmentSourceUrl(
      "https://storage.googleapis.com/alice-and-bot-attachments/attachments/c1/hash.png",
    ),
    true,
  );
  assertEquals(
    isSafeAttachmentSourceUrl("https://evil.example.com/beacon.png"),
    false,
  );
  assertEquals(
    isSafeAttachmentSourceUrl("http://169.254.169.254/latest/meta-data/"),
    false,
  );
  assertEquals(
    isSafeAttachmentSourceUrl(
      "https://storage.googleapis.com/alice-and-bot-attachments/../../other",
    ),
    false,
  );

  assertEquals(
    isSafeDecryptedMediaUrl("blob:https://aliceandbot.com/123"),
    true,
  );
  assertEquals(isSafeDecryptedMediaUrl("javascript:alert(1)"), false);
  assertEquals(
    isSafeDecryptedMediaUrl("data:text/html,<script>alert(1)</script>"),
    false,
  );

  assertEquals(sanitizeDownloadFilename("../../evil.html"), "evil.html.bin");
  assertEquals(sanitizeDownloadFilename("payload.svg"), "payload.svg.bin");
  assertEquals(sanitizeDownloadFilename("report.pdf"), "report.pdf");
});
