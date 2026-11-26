import { expect, test } from "@playwright/test";
import {
  generateTestData,
  makeEncryptedMessage,
  type TestData,
} from "./mocks/test-data.ts";
import {
  clearStorage,
  elementInkBounds,
  injectMessengerCredentials,
  pollLocalStorage,
  pollLocalStorageNull,
  setupMessengerMocks,
  tid,
} from "./helpers.ts";

const isInViewport = async (
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
) => {
  const box = await locator.boundingBox();
  if (!box) return false;
  const viewport = page.viewportSize()!;
  return box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0 &&
    box.x + box.width <= viewport.width;
};

test.describe("Messenger smoke", () => {
  test("landing page code example does not cause horizontal scroll on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const codeBlock = page.locator("pre code.language-typescript").first();
    await expect(codeBlock).toBeVisible({ timeout: 15_000 });
    const scrollWidth = await page.evaluate(() =>
      document.documentElement.scrollWidth
    );
    const clientWidth = await page.evaluate(() =>
      document.documentElement.clientWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("landing page code block wraps on mobile without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const pre = page.locator("pre").filter({
      has: page.locator("code.language-typescript"),
    }).first();
    await expect(pre).toBeVisible({ timeout: 15_000 });
    const { scrollable, whiteSpace } = await pre.evaluate((el) => ({
      scrollable: el.scrollWidth > el.clientWidth,
      whiteSpace: getComputedStyle(el).whiteSpace,
    }));
    expect(scrollable).toBe(false);
    expect(whiteSpace).toBe("pre-wrap");
  });

  test("chat page loads and shows name input in viewport without mocks", async ({ page }) => {
    await page.goto("/chat");
    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    expect(await isInViewport(page, nameInput)).toBe(true);
  });

  test("navigating from root to /chat via Messenger link loads chat", async ({ page }) => {
    await page.goto("/");
    const messengerLink = page.getByRole("link", { name: "Messenger" }).first();
    await expect(messengerLink).toBeVisible({ timeout: 15_000 });
    await messengerLink.click();
    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    expect(await isInViewport(page, nameInput)).toBe(true);
  });

  test("landing page scrolls after navigating back from /chat", async ({ page }) => {
    await page.goto("/");
    const messengerLink = page.getByRole("link", { name: "Messenger" }).first();
    await expect(messengerLink).toBeVisible({ timeout: 15_000 });
    await messengerLink.click();
    await expect(page.locator("input").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.goBack();
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    const scrollable = await page.evaluate(() =>
      document.documentElement.scrollHeight >
        document.documentElement.clientHeight
    );
    expect(scrollable).toBe(true);
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).not.toBe("hidden");
  });

  test("navigating from root to /chat with credentials shows conversations", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/");
    const messengerLink = page.getByRole("link", { name: "Messenger" }).first();
    await expect(messengerLink).toBeVisible({ timeout: 15_000 });
    await messengerLink.click();
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
  });
  test("dark mode toggled on landing page persists after navigating to /chat", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/");
    const headerToggle = page.getByRole("button", { name: /switch to dark/i });
    await expect(headerToggle).toBeVisible({ timeout: 15_000 });
    await headerToggle.click();
    await expect.poll(
      () =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark")
        ),
      { timeout: 3_000 },
    ).toBe(true);
    const messengerLink = page.getByRole("link", { name: "Messenger" }).first();
    await messengerLink.click();
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      ),
    ).toBe(true);
    const chatToggle = page.getByRole("button", { name: /switch to light/i });
    await expect(chatToggle).toBeVisible({ timeout: 3_000 });
  });
});

let data: TestData;
const credKey = "alicebot_credentials";

test.beforeAll(async () => {
  data = await generateTestData();
});

test.describe("Messenger (landing /chat)", () => {
  test("login form renders for unauthenticated user", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await clearStorage(page, credKey);
    await page.goto("/chat");
    await expect(page.locator("input").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("entering name creates credentials and stores them", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await clearStorage(page, credKey);
    await page.goto("/chat");
    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill("TestUser");
    await nameInput.press("Enter");
    await pollLocalStorage(page, credKey).not.toBeNull();
    const stored = await page.evaluate(
      (k: string) => localStorage.getItem(k),
      credKey,
    );
    const parsed = JSON.parse(stored!);
    expect(parsed.publicSignKey).toBeTruthy();
    expect(parsed.privateSignKey).toBeTruthy();
  });

  test("authenticated user sees conversation list", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking conversation opens chat with decrypted messages", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");
    const convo = page.getByText("Test Conversation").first();
    await expect(convo).toBeVisible({ timeout: 15_000 });
    await convo.click();
    await expect(page.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("back navigation returns to conversation list", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");
    const convo = page.getByText("Test Conversation").first();
    await expect(convo).toBeVisible({ timeout: 15_000 });
    await convo.click();
    await expect(page.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });
    await page.goBack();
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("dark mode toggle changes background", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
    const toggleBtn = page.getByRole("button", { name: /switch to dark/i });
    const bgBefore = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    await toggleBtn.click();
    await expect.poll(
      () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      { timeout: 3_000 },
    ).not.toBe(bgBefore);
  });

  test("dark mode applies inside open conversation", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /switch to dark/i }).click();
    await expect.poll(
      () =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark")
        ),
      { timeout: 3_000 },
    ).toBe(true);
    await page.getByText("Test Conversation").first().click();
    await expect(page.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });
    const chatBg = await page.locator(tid("chat-container")).evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const r = parseInt(chatBg.match(/\d+/)?.[0] ?? "255");
    expect(r).toBeLessThan(50);
  });

  test("first /chat load in system dark mode keeps messenger shell dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.addInitScript(() => localStorage.removeItem("theme"));
    await page.goto("/chat");
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(
      () =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark")
        ),
      { timeout: 3_000 },
    ).toBe(true);
    const sidebarBg = await page.getByTitle("Messages").evaluate((button) =>
      getComputedStyle(button.parentElement!).backgroundColor
    );
    expect(sidebarBg).not.toBe("rgb(248, 247, 244)");
  });

  test("credentials persist across page reload", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("empty name input does not create identity", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await clearStorage(page, credKey);
    await page.goto("/chat");
    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill("");
    await nameInput.press("Enter");
    await pollLocalStorageNull(page, credKey);
  });

  test("desktop close button deselects conversation", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");
    const convo = page.getByText("Test Conversation").first();
    await expect(convo).toBeVisible({ timeout: 15_000 });
    await convo.click();
    await expect(page.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });
    const closeBtn = page.getByTestId("widget-close-button");
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });
    await closeBtn.click();
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("loading credentials from transfer URL does not show unauthenticated screen during fetch", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await clearStorage(page, credKey);
    await page.goto("/chat#transfer=delayed-relay:some-aes-key");

    // The name input / "We don't know you yet" should NOT be visible initially while transfer is in flight
    const nameInput = page.locator("input").first();
    await expect(nameInput).not.toBeVisible();

    // The login/unauthenticated text should NOT be visible
    await expect(page.getByText("We don't know you yet")).not.toBeVisible();

    // Eventually, it should time out / fail and recover to the name input screen
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
  });

  test("mobile header back arrow and three dots are vertically aligned in light and dark mode and back arrow leads to all chats page", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto(`/chat?c=${encodeURIComponent(data.conversationId)}`);
    const backBtn = page.getByTestId("back-to-chats-button");
    const menuBtn = page.getByTestId("menu-button");
    const titleText = page.getByTestId("title-text");
    await expect(backBtn).toBeVisible({ timeout: 10_000 });
    await expect(menuBtn).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("widget-close-button")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);

    const backBox = (await backBtn.boundingBox())!;
    const titleBox = (await titleText.boundingBox())!;
    expect(backBox.x).toBeLessThan(titleBox.x);

    const lightMenu = await elementInkBounds(page, menuBtn);
    const lightBack = await elementInkBounds(page, backBtn);
    expect(Math.abs(lightBack.centerY - lightMenu.centerY))
      .toBeLessThanOrEqual(
        0.5,
      );

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const darkMenu = await elementInkBounds(page, menuBtn);
    const darkBack = await elementInkBounds(page, backBtn);
    expect(Math.abs(darkBack.centerY - darkMenu.centerY)).toBeLessThanOrEqual(
      0.5,
    );

    await backBtn.click();
    await expect(page.getByPlaceholder("Search chats...")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 10_000,
    });
    expect(new URL(page.url()).searchParams.get("c")).toBeNull();

    await context.close();
  });

  test("mobile messenger does not auto-focus input on open, landscape touch open, conversation select, or returning from background", async ({ browser }) => {
    const isInputFocused = (page: import("@playwright/test").Page) =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === "TEXTAREA" || el?.tagName === "INPUT";
      });

    // 1. Portrait mobile direct open + search-to-chat transition + background blur
    const portraitContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const portraitPage = await portraitContext.newPage();
    await setupMessengerMocks(portraitPage, data);
    await injectMessengerCredentials(portraitPage, data, credKey);
    await portraitPage.goto("/chat");
    const searchInput = portraitPage.getByPlaceholder("Search chats...");
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    expect(await isInputFocused(portraitPage)).toBe(false);

    await searchInput.focus();
    expect(await isInputFocused(portraitPage)).toBe(true);
    await portraitPage.getByText("Test Conversation").first().click();
    await expect(portraitPage.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });
    expect(await isInputFocused(portraitPage)).toBe(false);

    const msgInput = portraitPage.getByTestId("message-input");
    await msgInput.focus();
    expect(await isInputFocused(portraitPage)).toBe(true);
    await portraitPage.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await isInputFocused(portraitPage)).toBe(false);
    await portraitContext.close();

    // 2. Landscape / wide touch device (>768px) must still not auto-focus message input
    const landscapeContext = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const landscapePage = await landscapeContext.newPage();
    await setupMessengerMocks(landscapePage, data);
    await injectMessengerCredentials(landscapePage, data, credKey);
    await landscapePage.goto(
      `/chat?c=${encodeURIComponent(data.conversationId)}`,
    );
    await expect(landscapePage.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });
    expect(await isInputFocused(landscapePage)).toBe(false);
    await landscapeContext.close();
  });

  test("opening /chat?c= from a notification renders pushed message from IndexedDB immediately even before WebSocket catches up", async ({ page }) => {
    const pushedText = "Instant notification reply before WS sync";
    const pushedCipher = await makeEncryptedMessage(
      data.conversationKey,
      data.bob,
      pushedText,
    );
    const pushedEntry = {
      id: crypto.randomUUID(),
      payload: pushedCipher,
      timestamp: Date.now() + 10_000,
    };

    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.addInitScript(
      (seed: {
        conversationId: string;
        symKey: string;
        msg: { id: string; payload: string; timestamp: number };
      }) => {
        const req = indexedDB.open("alicebot_push_store", 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("kv")) {
            req.result.createObjectStore("kv");
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("kv", "readwrite");
          const store = tx.objectStore("kv");
          store.put(seed.symKey, `conv_key:${seed.conversationId}`);
          store.put([seed.msg], `conv_msgs:${seed.conversationId}`);
          tx.oncomplete = () => db.close();
        };
      },
      {
        conversationId: data.conversationId,
        symKey: data.conversationKey,
        msg: pushedEntry,
      },
    );

    await page.goto(`/chat?c=${encodeURIComponent(data.conversationId)}`);
    const messageList = page.getByTestId("message-list");
    await expect(messageList.getByText(pushedText)).toBeVisible({
      timeout: 2_000,
    });
    await expect(messageList.getByText(data.messages[0].text)).toBeVisible({
      timeout: 5_000,
    });
    // Still visible after WS snapshot delivered older history without pushedEntry
    await expect(messageList.getByText(pushedText)).toBeVisible();
    await expect(page.getByTestId("conversation-last-message").first())
      .toHaveText(pushedText);
  });

  test("conversations list shows last message preview, live typing indicator, and updates on new message", async ({ page }) => {
    const { wsMock } = await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");

    const preview = page.getByTestId("conversation-last-message").first();
    await expect(preview).toHaveText("You: Just building some E2E tests.", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("conversation-time").first()).toBeVisible();

    const typingAt = Date.now();
    wsMock.pushTypingSnapshot(typingAt);
    const typingIndicator = page.getByTestId("conversation-typing-indicator")
      .first();
    await expect(typingIndicator).toContainText("typing…", { timeout: 5_000 });
    await expect(preview).toHaveCount(0);

    const bobReply = "Awesome, let me know when it ships!";
    const bobCipher = await makeEncryptedMessage(
      data.conversationKey,
      data.bob,
      bobReply,
    );
    wsMock.pushNewMessage({
      id: crypto.randomUUID(),
      payload: bobCipher,
      timestamp: typingAt + 1_000,
      senderPublicSignKey: data.bob.publicSignKey,
    });

    await expect(page.getByTestId("conversation-last-message").first())
      .toHaveText(bobReply, { timeout: 10_000 });
    await expect(page.getByTestId("conversation-typing-indicator")).toHaveCount(
      0,
    );
  });

  test("desktop keyboard shortcuts switch between threads with Alt+ArrowDown/ArrowUp while composer is focused", async ({ page }) => {
    const now = Date.now();
    await setupMessengerMocks(page, data, [
      { id: "conv-second", title: "Second Thread", updatedAt: now - 10_000 },
      { id: "conv-third", title: "Third Thread", updatedAt: now - 20_000 },
    ]);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");

    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Second Thread").first()).toBeVisible();
    await expect(page.getByText("Third Thread").first()).toBeVisible();

    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByTestId("title-text")).toContainText(
      "Test Conversation",
      { timeout: 10_000 },
    );
    const input = page.getByTestId("message-input");
    await expect(input).toBeFocused({ timeout: 5_000 });

    await input.press("Alt+ArrowDown");
    await expect(page.getByTestId("title-text")).toContainText(
      "Second Thread",
      { timeout: 10_000 },
    );
    await expect(input).toBeFocused({ timeout: 5_000 });

    await input.press("Alt+ArrowDown");
    await expect(page.getByTestId("title-text")).toContainText("Third Thread", {
      timeout: 10_000,
    });

    await input.press("Alt+ArrowUp");
    await expect(page.getByTestId("title-text")).toContainText(
      "Second Thread",
      { timeout: 10_000 },
    );
  });

  test("desktop Ctrl+K searches threads and Enter opens match, and Ctrl+/ toggles shortcuts modal", async ({ page }) => {
    const now = Date.now();
    await setupMessengerMocks(page, data, [
      { id: "conv-alpha", title: "Alpha Project", updatedAt: now - 10_000 },
    ]);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");

    await expect(page.getByText("Alpha Project").first()).toBeVisible({
      timeout: 15_000,
    });

    await page.keyboard.press("Control+k");
    const search = page.getByTestId("chat-search-input");
    await expect(search).toBeFocused();
    await search.fill("Alpha");
    await search.press("Enter");

    await expect(page.getByTestId("title-text")).toContainText(
      "Alpha Project",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("message-input")).toBeFocused({
      timeout: 5_000,
    });

    await page.keyboard.press("Control+/");
    await expect(page.getByTestId("shortcuts-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shortcuts-modal")).toHaveCount(0);
    await expect(page.getByTestId("title-text")).toContainText("Alpha Project");
  });

  test("ArrowUp edits the newest own message and Ctrl+ArrowUp selects the newest message", async ({ page }) => {
    await setupMessengerMocks(page, data);
    await injectMessengerCredentials(page, data, credKey);
    await page.goto("/chat");

    await page.getByText("Test Conversation").first().click();
    await expect(
      page.getByTestId("message-list").getByText(
        "Just building some E2E tests.",
      ),
    ).toBeVisible({
      timeout: 15_000,
    });

    const input = page.getByTestId("message-input");
    await input.click();
    await input.press("ArrowUp");

    const editInput = page.getByTestId("edit-message-input");
    await expect(editInput).toBeVisible();
    await expect(editInput).toHaveValue("Just building some E2E tests.");

    await editInput.press("Escape");
    await expect(input).toBeFocused();

    await input.press("Control+ArrowUp");
    const lastMsg = page.getByTestId("message").last();
    await expect(lastMsg).toHaveAttribute("data-keyboard-selected", "");
    await expect(lastMsg).toContainText("Just building some E2E tests.");
  });
});
