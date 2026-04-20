import { expect, test } from "@playwright/test";
import { generateTestData, type TestData } from "./mocks/test-data.ts";
import {
  pollSentMessages,
  setupChatMocks,
  tid,
  waitForChat,
} from "./helpers.ts";

const problematicMobileMessage = String
  .raw`Here is the TypeScript script I ran. It fetches data directly from a public screener page, parses the HTML table, and filters the results to ensure they match exact market cap and P/E criteria:

<br><br>
<code>
import * as cheerio from "npm:cheerio";&lt;br&gt;
&lt;br&gt;
async function getFinviz() {&lt;br&gt;
&nbsp;&nbsp;// URL includes filters: EPS growth past 5y &gt; 10%, P/E &gt; 8, P/E &lt; 15&lt;br&gt;
&nbsp;&nbsp;const url = "https://example.invalid/screener?f=eps5y_o10,pe_o8,pe_u15";&lt;br&gt;
&nbsp;&nbsp;&lt;br&gt;
&nbsp;&nbsp;const res = await fetch(url, {&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;headers: {&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"User-Agent": "REDACTED_TEST_USER_AGENT"&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;}&lt;br&gt;
&nbsp;&nbsp;});&lt;br&gt;
&lt;br&gt;
&nbsp;&nbsp;const text = await res.text();&lt;br&gt;
&nbsp;&nbsp;const $ = cheerio.load(text);&lt;br&gt;
&nbsp;&nbsp;&lt;br&gt;
&nbsp;&nbsp;let found = [];&lt;br&gt;
&lt;br&gt;
&nbsp;&nbsp;// Parse the screener table&lt;br&gt;
&nbsp;&nbsp;$("table.styled-table-new tr").each((i, el) =&gt; {&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;const row = $(el);&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;const cells = [];&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;row.find("td").each((j, td) =&gt; {&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;cells.push($(td).text().trim());&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;});&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;// Skip header rows and empty rows&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;if (cells.length &gt; 5 &amp;&amp; cells[1] &amp;&amp; cells[1] !== 'Ticker') {&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const ticker = cells[1];&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const company = cells[2];&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const sector = cells[3];&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const mcapStr = cells[6];&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const peStr = cells[7];&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const priceStr = cells[8];&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;// Convert market cap string (e.g. "4.08B") to a number for filtering&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;let mcap = 0;&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;if (mcapStr.endsWith("B")) mcap = parseFloat(mcapStr) * 1e9;&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;else if (mcapStr.endsWith("M")) mcap = parseFloat(mcapStr) * 1e6;&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;else mcap = parseFloat(mcapStr);&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const pe = parseFloat(peStr);&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;// Ensure Market Cap is under 5B and P/E is between 8 and 15&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;if (mcap &lt; 5e9 &amp;&amp; pe &gt;= 8 &amp;&amp; pe &lt;= 15) {&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;found.push({&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ticker, company, sector, marketCap: mcapStr, pe: peStr, price: priceStr&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;});&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}&lt;br&gt;
&nbsp;&nbsp;&nbsp;&nbsp;}&lt;br&gt;
&nbsp;&nbsp;});&lt;br&gt;
&nbsp;&nbsp;&lt;br&gt;
&nbsp;&nbsp;return JSON.stringify(found.slice(0, 10), null, 2);&lt;br&gt;
}&lt;br&gt;
&lt;br&gt;
await getFinviz();&lt;br&gt;
</code>
<br><br>
If you want, I can set this up to run daily and send you the results!`;

const longUnbrokenInlineCode = "x".repeat(2000);

const mobileOverflowPayload =
  `${problematicMobileMessage}<br><br><code>${longUnbrokenInlineCode}</code>`;

declare global {
  // deno-lint-ignore no-explicit-any
  var __TEST_CHAT__: any;
}

let data: TestData;

test.beforeAll(async () => {
  data = await generateTestData();
});

test.describe("Chat (full encryption pipeline)", () => {
  test("mobile: long code-like message does not overflow or clip bubble content", async ({ page }) => {
    const { makeEncryptedMessage } = await import("./mocks/test-data.ts");
    const payload = await makeEncryptedMessage(
      data.conversationKey,
      data.bob,
      mobileOverflowPayload,
    );
    const overflowMessage = {
      ...data.messages[0],
      id: crypto.randomUUID(),
      payload,
      text: mobileOverflowPayload,
      timestamp: Date.now(),
      senderPublicSignKey: data.bob.publicSignKey,
    };
    await page.setViewportSize({ width: 375, height: 667 });
    await setupChatMocks(page, data, {
      dataOverride: { messages: [...data.messages, overflowMessage] },
    });
    await page.goto("/");
    await waitForChat(page);
    const lastBubble = page.locator(".msg-bubble").last();
    await expect(lastBubble).toBeVisible({ timeout: 15_000 });
    const overflowStats = await lastBubble.evaluate((bubble) => {
      const descendants = [bubble, ...Array.from(bubble.querySelectorAll("*"))];
      const offenders = descendants.filter((el) => {
        const htmlEl = el as HTMLElement;
        return htmlEl.scrollWidth - htmlEl.clientWidth > 1;
      });
      return {
        hasOverflowingDescendants: offenders.length > 0,
        offenderCount: offenders.length,
      };
    });
    expect(overflowStats.hasOverflowingDescendants).toBe(false);
    const pageHasHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    expect(pageHasHorizontalOverflow).toBe(false);
  });

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

  test("typing indicator clears when matching message arrives", async ({ page }) => {
    const { wsMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);

    wsMock.pushTypingSnapshot(Date.now());
    await expect(page.getByText("Bob is typing...")).toBeVisible({
      timeout: 10_000,
    });

    const realtimeText = "Message after typing";
    const { makeEncryptedMessage } = await import("./mocks/test-data.ts");
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
    await expect(page.getByText("Bob is typing...")).toHaveCount(0);
  });

  test("typing indicator stays cleared after re-emitted typing snapshot", async ({ page }) => {
    const { wsMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);

    const typingTime = Date.now();
    wsMock.pushTypingSnapshot(typingTime);
    await expect(page.getByText("Bob is typing...")).toBeVisible({
      timeout: 10_000,
    });

    const realtimeText = "Message suppresses typing";
    const { makeEncryptedMessage } = await import("./mocks/test-data.ts");
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
    await expect(page.getByText("Bob is typing...")).toHaveCount(0);

    wsMock.pushTypingSnapshot(typingTime);
    await page.waitForTimeout(500);
    await expect(page.getByText("Bob is typing...")).toHaveCount(0);
  });

  test("transient empty snapshot does not flash empty state", async ({ page }) => {
    const { wsMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });

    wsMock.pushMessageSnapshot([]);

    await expect(page.locator(tid("empty-state"))).toHaveCount(0);
    await expect(page.getByText(data.messages[0].text)).toBeVisible();
  });

  test("repeated conversation key snapshots do not flash empty state", async ({ page }) => {
    const { wsMock } = await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });

    wsMock.pushConversationKeySnapshot();
    wsMock.pushConversationKeySnapshot();
    wsMock.pushConversationKeySnapshot();

    await expect(page.locator(tid("empty-state"))).toHaveCount(0);
    await expect(page.getByText(data.messages[0].text)).toBeVisible();
  });

  test("equivalent credentials reassignment does not flash empty state", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.getByText(data.messages[0].text)).toBeVisible({
      timeout: 15_000,
    });

    await page.evaluate(() => {
      const chat = globalThis.__TEST_CHAT__!;
      const credentials = chat.credentials!;
      chat.credentials = {
        publicSignKey: credentials.publicSignKey,
        privateSignKey: credentials.privateSignKey,
        privateEncryptKey: credentials.privateEncryptKey,
      };
    });

    await expect(page.locator(tid("empty-state"))).toHaveCount(0);
    await expect(page.getByText(data.messages[0].text)).toBeVisible();
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

  test("mic icon visible in send button when input empty", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    const svg = page.locator(`${tid("send-button")} svg`).first();
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("title-bar shows for non-hideTitle config", async ({ page }) => {
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await expect(page.locator(tid("title-bar"))).toBeVisible();
  });

  test("voice call click transitions chat-box into calling state", async ({ page, context }) => {
    await context.grantPermissions(["microphone"]);
    await setupChatMocks(page, data);
    await page.goto("/");
    await waitForChat(page);
    await page.evaluate(() => {
      globalThis.__TEST_CHAT__!.enableVoiceCall = true;
    });
    await page.locator(tid("voice-call-button")).click();
    await expect(page.getByText("Calling...")).toBeVisible({ timeout: 5_000 });
    const hasHandler = await page.evaluate(() => {
      const chatBox = document.querySelector("chat-box");
      return typeof (chatBox as unknown as { onStartCall?: unknown })
        ?.onStartCall === "function";
    });
    expect(hasHandler).toBe(true);
  });
});
