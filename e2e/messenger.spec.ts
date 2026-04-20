import { expect, test } from "@playwright/test";
import { generateTestData, type TestData } from "./mocks/test-data.ts";
import {
  clearStorage,
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
    const closeBtn = page.getByTestId("close-chat");
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });
    await closeBtn.click();
    await expect(page.getByText("Test Conversation").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
