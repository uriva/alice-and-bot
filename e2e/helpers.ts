import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { setupInstantWsMock, type WsMock } from "./mocks/instant-ws.ts";
import { setupBackendApiMock } from "./mocks/backend-api.ts";
import { setupGcsMock } from "./mocks/gcs.ts";
import type { TestData, TestCredentials } from "./mocks/test-data.ts";

declare global {
  interface Window {
    __TEST_CREDENTIALS__?: {
      publicSignKey: string;
      privateSignKey: string;
      privateEncryptKey: string;
    };
    __TEST_CONVERSATION_ID__?: string;
    __WIDGET_PARAMS__?: WidgetTestParams;
  }
}

type WidgetTestParams = {
  participants: string[];
  initialMessage?: string;
  startOpen?: boolean;
  buttonText?: string;
  defaultName?: string;
};

export const tid = (id: string) => `[data-testid="${id}"]`;

const credentialsPayload = ({ publicSignKey, privateSignKey, privateEncryptKey }: TestCredentials) =>
  ({ publicSignKey, privateSignKey, privateEncryptKey });

export const setupChatMocks = async (
  page: Page,
  data: TestData,
  { dataOverride }: { dataOverride?: Partial<TestData> } = {},
) => {
  const effective = { ...data, ...dataOverride };
  const wsMock = await setupInstantWsMock(page, effective);
  const apiMock = await setupBackendApiMock(page, effective);
  await setupGcsMock(page);
  await page.addInitScript(
    (d: { credentials: Window["__TEST_CREDENTIALS__"]; conversationId: string }) => {
      window.__TEST_CREDENTIALS__ = d.credentials;
      window.__TEST_CONVERSATION_ID__ = d.conversationId;
    },
    { credentials: credentialsPayload(data.alice), conversationId: effective.conversationId },
  );
  return { wsMock, apiMock };
};

export const setupWidgetMocks = async (
  page: Page,
  data: TestData,
  extra: Partial<WidgetTestParams> = {},
) => {
  await setupInstantWsMock(page, data);
  await setupBackendApiMock(page, data);
  await setupGcsMock(page);
  await page.addInitScript(
    (params: WidgetTestParams) => { window.__WIDGET_PARAMS__ = params; },
    { participants: [data.bob.publicSignKey], initialMessage: "Hi from widget!", ...extra },
  );
};

export const setupMessengerMocks = async (page: Page, data: TestData) => {
  await setupInstantWsMock(page, data);
  await setupBackendApiMock(page, data);
  await setupGcsMock(page);
};

export const injectMessengerCredentials = (page: Page, data: TestData, key: string) =>
  page.addInitScript(
    (args: { key: string; creds: string }) => localStorage.setItem(args.key, args.creds),
    { key, creds: JSON.stringify(credentialsPayload(data.alice)) },
  );

export const clearStorage = (page: Page, key: string) =>
  page.addInitScript((k: string) => localStorage.removeItem(k), key);

export const waitForChat = (page: Page) =>
  expect(page.locator(tid("chat-container"))).toBeVisible({ timeout: 15_000 });

export const pollSentMessages = (
  apiMock: { sentMessages: unknown[] },
  minCount = 1,
) => expect.poll(() => apiMock.sentMessages.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(minCount);

export const pollLocalStorage = (page: Page, key: string) =>
  expect.poll(() => page.evaluate((k: string) => localStorage.getItem(k), key), { timeout: 10_000 });

export const pollLocalStorageNull = (page: Page, key: string) =>
  expect.poll(() => page.evaluate((k: string) => localStorage.getItem(k), key), { timeout: 3_000 }).toBeNull();
