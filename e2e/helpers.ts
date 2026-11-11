import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { setupInstantWsMock } from "./mocks/instant-ws.ts";
import { setupBackendApiMock } from "./mocks/backend-api.ts";
import { setupGcsMock } from "./mocks/gcs.ts";
import type { TestCredentials, TestData } from "./mocks/test-data.ts";

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
  enableVoiceCall?: boolean;
};

export const tid = (id: string) => `[data-testid="${id}"]`;

const credentialsPayload = (
  { publicSignKey, privateSignKey, privateEncryptKey }: TestCredentials,
) => ({ publicSignKey, privateSignKey, privateEncryptKey });

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
    (
      d: {
        credentials: Window["__TEST_CREDENTIALS__"];
        conversationId: string;
      },
    ) => {
      // deno-lint-ignore no-window
      window.__TEST_CREDENTIALS__ = d.credentials;
      // deno-lint-ignore no-window
      window.__TEST_CONVERSATION_ID__ = d.conversationId;
    },
    {
      credentials: credentialsPayload(data.alice),
      conversationId: effective.conversationId,
    },
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
    (params: WidgetTestParams) => {
      // deno-lint-ignore no-window
      window.__WIDGET_PARAMS__ = params;
    },
    {
      participants: [data.bob.publicSignKey],
      initialMessage: "Hi from widget!",
      ...extra,
    },
  );
};

export const setupMessengerMocks = async (page: Page, data: TestData) => {
  await setupInstantWsMock(page, data);
  await setupBackendApiMock(page, data);
  await setupGcsMock(page);
};

export const injectMessengerCredentials = (
  page: Page,
  data: TestData,
  key: string,
) =>
  page.addInitScript(
    (args: { key: string; creds: string }) =>
      localStorage.setItem(args.key, args.creds),
    { key, creds: JSON.stringify(credentialsPayload(data.alice)) },
  );

export const clearStorage = (page: Page, key: string) =>
  page.addInitScript((k: string) => localStorage.removeItem(k), key);

export const waitForChat = (page: Page) =>
  expect(page.locator(tid("chat-container"))).toBeVisible({ timeout: 15_000 });

export const pollSentMessages = (
  apiMock: { sentMessages: unknown[] },
  minCount = 1,
) =>
  expect.poll(() => apiMock.sentMessages.length, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(minCount);

export const pollLocalStorage = (page: Page, key: string) =>
  expect.poll(
    () => page.evaluate((k: string) => localStorage.getItem(k), key),
    { timeout: 10_000 },
  );

export const pollLocalStorageNull = (page: Page, key: string) =>
  expect.poll(
    () => page.evaluate((k: string) => localStorage.getItem(k), key),
    { timeout: 3_000 },
  ).toBeNull();

export const elementInkBounds = async (page: Page, locator: Locator) => {
  await locator.evaluate((el) => {
    const root = el.getRootNode();
    return Promise.all(
      [
        ...document.getAnimations(),
        ...(root instanceof ShadowRoot ? root.getAnimations() : []),
      ].map((a) => a.finished.catch(() => {})),
    );
  });
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element has no bounding box");
  const buf = await locator.screenshot({ animations: "disabled" });
  const src = `data:image/png;base64,${
    btoa(
      Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(""),
    )
  }`;
  const { imgHeight, minY, maxY } = await page.evaluate(
    async (dataUrl: string) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      const [bgR, bgG, bgB] = [data[0], data[1], data[2]];
      const inkRows = Array.from({ length: img.height }, (_, y) => y).filter((
        y,
      ) =>
        Array.from({ length: img.width }, (_, x) => (y * img.width + x) * 4)
          .some(
            (i) =>
              Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) +
                  Math.abs(data[i + 2] - bgB) >
                60,
          )
      );
      return {
        imgHeight: img.height,
        minY: inkRows[0],
        maxY: inkRows[inkRows.length - 1],
      };
    },
    src,
  );
  const scale = imgHeight / box.height;
  const top = box.y + minY / scale;
  const bottom = box.y + (maxY + 1) / scale;
  return {
    top,
    bottom,
    height: bottom - top,
    centerY: (top + bottom) / 2,
  };
};
