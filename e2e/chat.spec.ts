import { expect, test } from "@playwright/test";
import { generateTestData, type TestData } from "./mocks/test-data.ts";
import {
  pollSentMessages,
  setupChatMocks,
  tid,
  waitForChat,
} from "./helpers.ts";

let data: TestData;

test.beforeAll(async () => {
  data = await generateTestData();
});

test.describe("Chat (full encryption pipeline)", () => {
  test("chat-container renders with data-testid", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
  });

  test("decrypted messages render via data-testid='message'", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await Promise.all(
      data.messages.map(({ text }) =>
        expect(page.getByText(text)).toBeVisible({ timeout: 15_000 })
      ),
    );
    expect(await page.locator(tid("message")).count()).toBeGreaterThanOrEqual(
      data.messages.length,
    );
  });

  test("message-text elements contain decrypted content", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const firstText = page.locator(tid("message-text")).first();
    await expect(firstText).toBeVisible({ timeout: 15_000 });
    await expect(firstText).not.toBeEmpty();
  });

  test("send message flow fires encrypted HTTP POST", async ({ page }) => {
    const { apiMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const input = page.locator(tid("message-input"));
    await input.fill("Outbound test message");
    await input.press("Enter");
    await expect(page.getByText("Outbound test message")).toBeVisible({
      timeout: 5_000,
    });
    await pollSentMessages(apiMock);
    expect(apiMock.sentMessages[0].conversation).toBe(data.conversationId);
  });

  test("title-text shows conversation title", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await expect(page.locator(tid("title-text"))).toContainText(
      "Test Conversation",
      { timeout: 15_000 },
    );
  });

  test("empty conversation shows no messages", async ({ page }) => {
    await setupChatMocks(page, data, { dataOverride: { messages: [] } });
    await page.goto("/");
    await expect(page.locator(tid("message-input"))).toBeVisible({
      timeout: 15_000,
    });
    expect(await page.locator(tid("message")).count()).toBe(0);
  });

  test("real-time message arrival via pushNewMessage", async ({ page }) => {
    const { wsMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const { makeEncryptedMessage } = await import("./mocks/test-data.ts");
    const realtimeText = "Real-time arrival!";
    const payload = await makeEncryptedMessage(
      data.conversationKey,
      data.bob,
      realtimeText,
    );
    wsMock.pushNewMessage({
      id: crypto.randomUUID(),
      payload,
      timestamp: Date.now(),
      senderPublicSignKey: data.bob.publicSignKey,
    });
    await expect(page.getByText(realtimeText)).toBeVisible({ timeout: 10_000 });
  });

  test("own vs other messages have different x alignment", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const aliceMsg = page.getByText(data.messages[0].text);
    const bobMsg = page.getByText(data.messages[1].text);
    await expect(aliceMsg).toBeVisible();
    await expect(bobMsg).toBeVisible();
    const aliceBox = await aliceMsg.boundingBox();
    const bobBox = await bobMsg.boundingBox();
    expect(aliceBox!.x).not.toBe(bobBox!.x);
  });

  test("multiple sends are all captured by mock", async ({ page }) => {
    const { apiMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const input = page.locator(tid("message-input"));
    const texts = ["msg-one", "msg-two"];
    await texts.reduce(
      (p, t) =>
        p
          .then(() => input.fill(t))
          .then(() => input.press("Enter"))
          .then(() =>
            expect(page.getByText(t)).toBeVisible({ timeout: 5_000 })
          ),
      Promise.resolve(),
    );
    await pollSentMessages(apiMock, 2);
  });

  test("message order is preserved after decryption", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.getByText(data.messages[4].text)).toBeVisible({
      timeout: 15_000,
    });
    const positions = await Promise.all(
      data.messages.map(async (m) =>
        (await page.getByText(m.text).boundingBox())?.y ?? 0
      ),
    );
    expect(positions.slice(1).every((p, i) => p > positions[i])).toBe(true);
  });

  test("author-name renders for other participant", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.locator(tid("author-name")).first()).toContainText("Bob");
  });

  test("message-input clears after sending", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const input = page.locator(tid("message-input"));
    await input.fill("clear-check");
    await input.press("Enter");
    await expect(page.getByText("clear-check")).toBeVisible();
    await expect(input).toHaveValue("");
  });

  test("encrypted payload in HTTP body is not plaintext", async ({ page }) => {
    const { apiMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const input = page.locator(tid("message-input"));
    await input.fill("secret-payload-test");
    await input.press("Enter");
    await expect(page.getByText("secret-payload-test")).toBeVisible();
    await pollSentMessages(apiMock);
    const sent = apiMock.sentMessages[0]?.encryptedMessage ?? "";
    expect(sent).not.toContain("secret-payload-test");
    expect(sent.length).toBeGreaterThan(0);
  });

  test("message-list container exists with data-testid", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.locator(tid("message-list"))).toBeVisible();
  });

  test("send-button exists with data-testid", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.locator(tid("send-button"))).toBeVisible();
  });

  test("title-bar shows for non-hideTitle config", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.locator(tid("title-bar"))).toBeVisible();
  });
});
