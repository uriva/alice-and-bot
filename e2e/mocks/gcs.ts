import type { Page, Route } from "@playwright/test";
import { Buffer } from "node:buffer";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export const setupGcsMock = async (page: Page) => {
  await page.route("**/storage.googleapis.com/**", async (route: Route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ status: 200, body: "" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: tinyPng,
    });
  });
};
