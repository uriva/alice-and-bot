import { expect, test } from "@playwright/test";
import { tid } from "./helpers.ts";

test.describe("AbstractChatBox (example app)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(tid("chat-container"), { timeout: 10_000 });
  });

  test("chat container renders", async ({ page }) => {
    await expect(page.locator(tid("chat-container"))).toBeVisible();
  });

  test("all mock messages render", async ({ page }) => {
    await expect(
      page.getByText("Hey, can you help me with a sorting algorithm?"),
    ).toBeVisible();
    const lastMsg = page.getByText("Nice! Here's your location on the map:");
    await lastMsg.scrollIntoViewIfNeeded();
    await expect(lastMsg).toBeVisible();
  });

  test("messages use data-testid='message'", async ({ page }) => {
    const messages = page.locator(tid("message"));
    await expect(messages.first()).toBeVisible();
    expect(await messages.count()).toBeGreaterThanOrEqual(10);
  });

  test("message text uses data-testid='message-text'", async ({ page }) => {
    const texts = page.locator(tid("message-text"));
    await expect(texts.first()).toBeVisible();
    await expect(texts.first()).not.toBeEmpty();
  });

  test("markdown renders bold", async ({ page }) => {
    await expect(page.locator(`${tid("message-text")} strong`).first())
      .toBeVisible();
  });

  test("code blocks render with pre and code tags", async ({ page }) => {
    const codeBlock = page.locator("pre code").first();
    await expect(codeBlock).toBeVisible();
    await expect(codeBlock).toContainText("mergeSort");
  });

  test("send a message via Enter", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    await input.fill("New test message");
    await input.press("Enter");
    await expect(page.getByText("New test message")).toBeVisible();
  });

  test("optimistic UI — message appears without network round-trip", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    await input.fill("Instant message");
    await input.press("Enter");
    await expect(page.getByText("Instant message")).toBeVisible({
      timeout: 500,
    });
  });

  test("empty input is rejected — no new message added", async ({ page }) => {
    const countBefore = await page.locator(tid("message")).count();
    await page.locator(tid("message-input")).press("Enter");
    expect(await page.locator(tid("message")).count()).toBe(countBefore);
  });

  test("dark mode background applied", async ({ page }) => {
    const bg = await page.locator(tid("chat-container")).evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).not.toBe("rgb(255, 255, 255)");
  });

  test("hideTitle hides the title bar", async ({ page }) => {
    await expect(page.locator(tid("title-bar"))).not.toBeVisible();
  });

  test("hideNames hides author names", async ({ page }) => {
    await expect(page.locator(tid("author-name"))).toHaveCount(0);
  });

  test("location attachment renders map link", async ({ page }) => {
    await expect(page.locator(tid("location-attachment"))).toBeVisible();
    await expect(page.locator(tid("location-attachment"))).toContainText(
      "Tel Aviv, Israel",
    );
  });

  test("input auto-grows with multiline text", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    const initialHeight = await input.evaluate((el) => el.scrollHeight);
    await input.fill("Line 1\nLine 2\nLine 3\nLine 4\nLine 5");
    const newHeight = await input.evaluate((el) => el.scrollHeight);
    expect(newHeight).toBeGreaterThan(initialHeight);
  });

  test("long single-line input becomes scrollable instead of clipping text", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    await input.fill(
      "This is a really long single line message with no newlines at all "
        .repeat(12),
    );
    await expect.poll(() =>
      input.evaluate((el) => getComputedStyle(el).overflowY)
    ).not.toBe("hidden");
    const contentExceedsBox = await input.evaluate((el) =>
      el.scrollHeight > el.clientHeight
    );
    expect(contentExceedsBox).toBe(true);
  });

  test("table renders in markdown", async ({ page }) => {
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    await expect(table.locator("th").first()).toContainText("Algorithm");
  });

  test("send button exists", async ({ page }) => {
    await expect(page.locator(tid("send-button"))).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    const countBefore = await page.locator(tid("message")).count();
    await page.locator(tid("send-button")).click();
    expect(await page.locator(tid("message")).count()).toBe(countBefore);
  });

  test("rapid consecutive sends all render", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    const texts = ["rapid-1", "rapid-2", "rapid-3"];
    await texts.reduce(
      (p, t) => p.then(() => input.fill(t)).then(() => input.press("Enter")),
      Promise.resolve(),
    );
    await Promise.all(
      texts.map((t) => expect(page.getByText(t)).toBeVisible()),
    );
  });

  test("very long message renders without layout break", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    const longText = "A".repeat(500);
    await input.fill(longText);
    await input.press("Enter");
    await expect(page.getByText(longText)).toBeVisible();
    const viewport = page.viewportSize()!;
    const msgBox = await page.getByText(longText).boundingBox();
    expect(msgBox!.width).toBeLessThanOrEqual(viewport.width);
  });

  test("wide code block does not break layout", async ({ page }) => {
    const codeLine = String
      .raw`Invalid arguments: {"name":"ZodError","message":"[\n  {\n    \"code\": \"unrecognized_keys\",\n    \"keys\": [\n      \"content\",\n      \"machineId\",\n      \"filePath\"\n    ],\n    \"path\": [],\n    \"message\": \"Unrecognized keys: \\\"content\\\", \\\"machineId\\\", \\\"filePath\\\"\"\n  }\n]"}`;
    const msg =
      `when agent get typing wrong for tools we return\n\nTool response:\n\n\`\`\`\n${codeLine}\n\`\`\`\n\ncan this be more concise?`;
    const input = page.locator(tid("message-input"));
    await input.fill(msg);
    await input.press("Enter");
    await expect(page.locator("pre code").last()).toBeVisible();
    const viewport = page.viewportSize()!;
    const container = page.locator(tid("chat-container"));
    const containerBox = await container.boundingBox();
    expect(containerBox!.width).toBeLessThanOrEqual(viewport.width);
    const bubble = page.locator(".msg-bubble").last();
    const bubbleBox = await bubble.boundingBox();
    expect(bubbleBox!.width).toBeLessThanOrEqual(containerBox!.width);
  });

  test("no horizontal overflow on any element after code block message", async ({ page }) => {
    const longLine = "x".repeat(500);
    const wideCode = `Here is the error:\n\n\`\`\`\n${longLine}\n\`\`\``;
    const input = page.locator(tid("message-input"));
    await input.fill(wideCode);
    await input.press("Enter");
    await expect(page.locator("pre code").last()).toBeVisible();
    const viewport = page.viewportSize()!;
    const bubble = page.locator(".msg-bubble").last();
    const bubbleBox = await bubble.boundingBox();
    expect(bubbleBox!.width).toBeLessThanOrEqual(
      Math.ceil(viewport.width * 0.8) + 2,
    );
    const docScrollW = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(docScrollW).toBeLessThanOrEqual(viewport.width);
  });

  test("XSS content is escaped safely", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    const xss = "<script>alert('xss')</script>";
    await input.fill(xss);
    await input.press("Enter");
    await expect(page.getByText("<script>alert('xss')</script>")).toBeVisible();
  });

  test("inline code renders in backticks", async ({ page }) => {
    await expect(page.locator("code").filter({ hasText: "Array.sort()" }))
      .toBeVisible();
  });

  test("blockquote renders", async ({ page }) => {
    await expect(page.locator("blockquote").first()).toBeVisible();
  });

  test("unordered list renders bullet items", async ({ page }) => {
    const list = page.locator("ul").first();
    await expect(list).toBeVisible();
    expect(await list.locator("li").count()).toBeGreaterThanOrEqual(2);
  });

  test("copy button appears on code blocks", async ({ page }) => {
    await expect(page.locator(tid("copy-code-button")).first()).toBeVisible();
  });

  test("attach button toggles menu", async ({ page }) => {
    await page.locator(tid("attach-button")).click();
    await expect(page.locator(tid("attach-menu"))).toBeVisible();
    await page.locator(tid("attach-button")).click();
    await expect(page.locator(tid("attach-menu"))).not.toBeVisible();
  });

  test("attach menu contains location option", async ({ page }) => {
    await page.locator(tid("attach-button")).click();
    await expect(page.locator(tid("attach-menu"))).toContainText("Location");
  });

  test("scrolling to top reveals earliest messages", async ({ page }) => {
    const firstMsg = page.getByText(
      "Hey, can you help me with a sorting algorithm?",
    );
    await firstMsg.scrollIntoViewIfNeeded();
    await expect(firstMsg).toBeVisible();
  });

  test("message list is scrollable", async ({ page }) => {
    const list = page.locator(tid("message-list"));
    const scrollable = await list.evaluate((el) =>
      el.scrollHeight > el.clientHeight
    );
    expect(scrollable).toBe(true);
  });

  test("shift+enter inserts newline instead of sending", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    const countBefore = await page.locator(tid("message")).count();
    await input.fill("line one");
    await input.press("Shift+Enter");
    await expect.poll(() => page.locator(tid("message")).count(), {
      timeout: 1_000,
    }).toBe(countBefore);
  });

  test("mic icon visible in send button when input is empty", async ({ page }) => {
    const sendBtn = page.locator(tid("send-button"));
    await expect(sendBtn).toBeVisible();
    const micSpan = sendBtn.locator("span").first();
    await expect(micSpan).toHaveCSS("opacity", "1");
    const svg = micSpan.locator("svg");
    await expect(svg).toBeVisible();
  });

  test("voice call button visible when enableVoiceCall is true", async ({ page }) => {
    await page.evaluate(() => {
      const chatBox = document.querySelector("chat-box") as
        & HTMLElement
        & Record<string, unknown>;
      chatBox.enableVoiceCall = true;
      const colors = chatBox.customColors as
        | Record<string, unknown>
        | undefined;
      if (colors) colors.hideTitle = false;
      chatBox.customColors = { ...colors };
    });
    await expect(page.locator(tid("voice-call-button"))).toBeVisible({
      timeout: 5_000,
    });
  });

  test("voice call button hidden when enableVoiceCall is false", async ({ page }) => {
    await expect(page.locator(tid("voice-call-button"))).not.toBeVisible();
  });

  test("sent message appears at bottom of list", async ({ page }) => {
    const input = page.locator(tid("message-input"));
    await input.fill("bottom-check");
    await input.press("Enter");
    await expect(page.getByText("bottom-check")).toBeVisible();
    const msgs = page.locator(tid("message"));
    const lastMsg = msgs.last();
    await expect(lastMsg).toContainText("bottom-check");
  });

  test("old messages show full text immediately without streaming animation", async ({ page }) => {
    const firstText = page.locator(tid("message-text")).first();
    await expect(firstText).toContainText("sorting algorithm", {
      timeout: 200,
    });
  });

  test("chat-message re-renders when msg property is updated", async ({ page }) => {
    const original = "Hey, can you help me with a sorting algorithm?";
    await expect(page.getByText(original)).toBeVisible();

    const updated = "reactivity-check-updated-text";
    await page.evaluate((text) => {
      const el = document.querySelector("chat-message") as
        & HTMLElement
        & Record<string, unknown>;
      el.msg = { ...(el.msg as Record<string, unknown>), text };
    }, updated);

    await expect(page.getByText(updated)).toBeVisible({ timeout: 3_000 });
  });

  test("reaction pills render for message with reactions", async ({ page }) => {
    const msgEl = page.locator("chat-message", {
      hasText: "Thanks, this is really helpful!",
    });
    await msgEl.scrollIntoViewIfNeeded();
    await expect(msgEl.locator("button", { hasText: "👍" })).toBeVisible();
    await expect(msgEl.locator("button", { hasText: "❤️" })).toBeVisible();
  });

  test("reaction pill shows count", async ({ page }) => {
    const msgEl = page.locator("chat-message", {
      hasText: "Thanks, this is really helpful!",
    });
    await msgEl.scrollIntoViewIfNeeded();
    await expect(msgEl.locator("button", { hasText: "👍" })).toContainText(
      "2",
    );
  });

  test("smiley trigger appears on hover for messages with onReact", async ({ page }) => {
    const msgEl = page.locator("chat-message").first();
    await msgEl.hover();
    await expect(msgEl.locator(".msg-smiley-trigger")).toBeVisible();
  });

  test("reply trigger appears on hover", async ({ page }) => {
    const msgEl = page.locator("chat-message").first();
    await msgEl.hover();
    await expect(msgEl.locator(".msg-reply-trigger")).toBeVisible();
  });

  test("quoted reply renders inside bubble", async ({ page }) => {
    const msgEl = page.locator("chat-message", {
      hasText: "Nice! What about the space complexity trade-offs?",
    });
    await msgEl.scrollIntoViewIfNeeded();
    await expect(msgEl.getByText("Assistant")).toBeVisible();
    await expect(
      msgEl.getByText("Of course! What kind of sorting are you looking for?"),
    ).toBeVisible();
  });

  test("clicking reply trigger shows reply bar above input", async ({ page }) => {
    const msgEl = page.locator("chat-message").first();
    await msgEl.hover();
    await msgEl.locator(".msg-reply-trigger").click();
    const inputArea = page.locator("[data-input-area]");
    await expect(inputArea.getByText("You", { exact: true })).toBeVisible();
  });

  test("sending with reply bar clears reply state", async ({ page }) => {
    const msgEl = page.locator("chat-message").first();
    await msgEl.hover();
    await msgEl.locator(".msg-reply-trigger").click();
    const inputArea = page.locator("[data-input-area]");
    await expect(inputArea.getByText("You", { exact: true })).toBeVisible();
    const input = page.locator(tid("message-input"));
    await input.fill("reply-test-msg");
    await input.press("Enter");
    await expect(page.getByText("reply-test-msg")).toBeVisible();
  });

  test("reply bar close button dismisses reply state", async ({ page }) => {
    const msgEl = page.locator("chat-message").first();
    await msgEl.hover();
    await msgEl.locator(".msg-reply-trigger").click();
    const inputArea = page.locator("[data-input-area]");
    await expect(inputArea.getByText("You", { exact: true })).toBeVisible();
    await inputArea.locator("button", { hasText: "×" }).click();
    await expect(inputArea.getByText("You", { exact: true })).not.toBeVisible();
  });

  test("transient stack animates to a pixel max-height when typing indicator appears", async ({ page }) => {
    await page.evaluate(() => {
      const chatBox = document.querySelector("chat-box") as
        & HTMLElement
        & Record<string, unknown>;
      chatBox.typingUsers = ["Alice"];
    });
    const stack = page.locator("[data-transient-stack]");
    await expect(stack).toHaveAttribute("style", /max-height:\s*\d+px/, {
      timeout: 2000,
    });
  });

  test("messages render in chronological order (oldest first)", async ({ page }) => {
    const texts = await page.locator(tid("message-text")).allInnerTexts();
    expect(texts.length).toBeGreaterThan(1);
    expect(texts[0]).toContain("sorting algorithm");
    expect(texts[texts.length - 1]).not.toContain("sorting algorithm");
  });
});

test.describe("AbstractChatBox mobile history load", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("loading older history with wide bubbles does not cause horizontal overflow", async ({ page }) => {
    await page.goto("/?loadMore=1");
    await page.waitForSelector(tid("chat-container"), { timeout: 10_000 });
    const scroller = page.locator(tid("chat-container")).locator(
      'div[style*="overflow-y:auto"]',
    ).first();
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.getByText("Older message 1.0")).toBeVisible();
    const viewport = page.viewportSize()!;
    const docScrollW = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(docScrollW).toBeLessThanOrEqual(viewport.width);
    const containerBox = await page.locator(tid("chat-container"))
      .boundingBox();
    expect(containerBox!.width).toBeLessThanOrEqual(viewport.width);
    const bubbleBoxes = await page.locator(".msg-bubble").evaluateAll(
      (els: Element[]) => els.map((el) => el.getBoundingClientRect().width),
    );
    bubbleBoxes.forEach((w: number) =>
      expect(w).toBeLessThanOrEqual(viewport.width)
    );
  });

  test("wide image does not cause horizontal overflow or layout break", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(tid("chat-container"), { timeout: 10_000 });
    const input = page.locator(tid("message-input"));
    const wideImgMarkdown =
      `![wide](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjEwMCI+PHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iMTAwIiBmaWxsPSJyZWQiLz48L3N2Zz4=)`;
    await input.fill(wideImgMarkdown);
    const sendBtn = page.locator(tid("send-button"));
    await sendBtn.dispatchEvent("touchstart");
    await sendBtn.dispatchEvent("touchend");
    await page.waitForSelector(`${tid("message")} img[alt="wide"]`, {
      timeout: 10_000,
    });

    const viewport = page.viewportSize()!;
    const docScrollW = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(docScrollW).toBeLessThanOrEqual(viewport.width);

    const containerBox = await page.locator(tid("chat-container"))
      .boundingBox();
    expect(containerBox!.width).toBeLessThanOrEqual(viewport.width);

    const imgBox = await page.locator(`${tid("message")} img[alt="wide"]`)
      .boundingBox();
    expect(imgBox!.width).toBeLessThanOrEqual(containerBox!.width);
  });
});

test("clicking Document button opens file chooser", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-testid="attach-button"]').click();
  await expect(page.locator('[data-testid="attach-menu"]')).toBeVisible();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("text=Document").click();
  const fileChooser = await fileChooserPromise;
  expect(fileChooser).toBeDefined();
});

test("attach menu works when chat-box is mounted inside a shadow root", async ({ page }) => {
  await page.goto("/?shadow=1");
  await page.locator('[data-testid="attach-button"]').click();
  await expect(page.locator('[data-testid="attach-menu"]')).toBeVisible();

  const fileChooserPromise = page.waitForEvent("filechooser", {
    timeout: 5_000,
  });
  await page.locator('[data-testid="attach-menu"]').getByText("Document")
    .click();
  expect(await fileChooserPromise).toBeDefined();
});

test("copying message text via selection has no trailing newlines", async ({ page }) => {
  await page.goto("/");
  const firstMessageText = page.locator('[data-testid="message-text"]').first();
  await expect(firstMessageText).toBeVisible();

  // Select the text inside data-testid="message-text"
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="message-text"]');
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  });

  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString() ?? ""
  );
  expect(selectedText).toBe("Hey, can you help me with a sorting algorithm?");
});

test("copying the entire msg-bubble via selection has no trailing newlines", async ({ page }) => {
  await page.goto("/");
  const bubble = page.locator(".msg-bubble").first();
  await expect(bubble).toBeVisible();

  // Select the text inside .msg-bubble
  await page.evaluate(() => {
    const el = document.querySelector(".msg-bubble");
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  });

  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString() ?? ""
  );
  console.log("SELECTED TEXT START:");
  console.log(JSON.stringify(selectedText));
  console.log("SELECTED TEXT END");
  expect(selectedText.endsWith("\n")).toBe(false);
});

test("copying a multi-paragraph message text has no trailing newlines", async ({ page }) => {
  await page.goto("/");
  const multiParaMessage = page.locator('[data-testid="message-text"]').filter({
    hasText: "Great questions!",
  }).first();
  await expect(multiParaMessage).toBeVisible();

  // Select the text inside this multi-paragraph message-text element
  await page.evaluate(() => {
    const el = Array.from(
      document.querySelectorAll('[data-testid="message-text"]'),
    ).find(
      (node) => node.textContent?.includes("Great questions!"),
    );
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  });

  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString() ?? ""
  );
  console.log("MULTI-PARA SELECTED TEXT START:");
  console.log(JSON.stringify(selectedText));
  console.log("MULTI-PARA SELECTED TEXT END");
  expect(selectedText.endsWith("\n")).toBe(false);
});

test("triple clicking a message bubble selects only the message text without trailing newlines", async ({ page }) => {
  await page.goto("/");
  const firstMessageText = page.locator('[data-testid="message-text"]').first();
  await expect(firstMessageText).toBeVisible();

  // Perform a triple-click on the first message text to select it
  await firstMessageText.click({ clickCount: 3 });

  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString() ?? ""
  );
  console.log("TRIPLE-CLICK SELECTED TEXT START:");
  console.log(JSON.stringify(selectedText));
  console.log("TRIPLE-CLICK SELECTED TEXT END");
  expect(selectedText.endsWith("\n")).toBe(false);
});

test("triple clicking the last paragraph of a multi-paragraph message has no trailing newlines", async ({ page }) => {
  await page.goto("/");
  const lastParagraph = page.locator('[data-testid="message-text"] span')
    .last();
  await expect(lastParagraph).toBeVisible();

  const style = await lastParagraph.evaluate((el) =>
    window.getComputedStyle(el).marginBottom
  );
  console.log("MARGIN-BOTTOM OF LAST PARAGRAPH:", style);

  // Perform a triple-click on the last paragraph to select it
  await lastParagraph.click({ clickCount: 3 });

  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString() ?? ""
  );
  console.log("LAST-PARA TRIPLE-CLICK SELECTED TEXT START:");
  console.log(JSON.stringify(selectedText));
  console.log("LAST-PARA TRIPLE-CLICK SELECTED TEXT END");
  expect(selectedText.endsWith("\n")).toBe(false);
});

test("message text container should contain only inline elements and no block-level elements like p or div", async ({ page }) => {
  await page.goto("/");
  const firstMessageText = page.locator('[data-testid="message-text"]').first();
  await expect(firstMessageText).toBeVisible();

  const hasBlocks = await firstMessageText.evaluate((el) => {
    return el.querySelector("p, div") !== null;
  });

  // It should have NO block-level elements inside
  expect(hasBlocks).toBe(false);
});

test("message text should contain no p tags at all to ensure perfect copying across all operating systems", async ({ page }) => {
  await page.goto("/");
  const multiParaMessage = page.locator('[data-testid="message-text"]').filter({
    hasText: "Great questions!",
  }).first();
  await expect(multiParaMessage).toBeVisible();

  const hasPTags = await multiParaMessage.evaluate((el) => {
    return el.querySelector("p") !== null;
  });

  // It should have NO p tags inside (we use display:inline-block spans instead)
  expect(hasPTags).toBe(false);
});
