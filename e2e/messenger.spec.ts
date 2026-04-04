import { expect, test } from "@playwright/test";
import { generateTestData, type TestData } from "./mocks/test-data.ts";
import {
  clearStorage,
  injectMessengerCredentials,
  pollLocalStorage,
  pollLocalStorageNull,
  setupMessengerMocks,
} from "./helpers.ts";

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
});
