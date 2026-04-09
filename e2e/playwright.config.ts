import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: 0,
  outputDir: ".playwright-results",
  use: {
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "cd .. && deno task chatgpt-style",
      port: 3001,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command:
        "cd fixtures && deno run -A --node-modules-dir=auto npm:vite --port 3003",
      port: 3003,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "cd .. && deno task landing",
      port: 3000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "abstract-chat-box",
      testMatch: "abstract-chat-box.spec.ts",
      use: { baseURL: "http://localhost:3001" },
    },
    {
      name: "chat",
      testMatch: "chat.spec.ts",
      use: { baseURL: "http://localhost:3003" },
    },
    {
      name: "widget",
      testMatch: "widget.spec.ts",
      use: { baseURL: "http://localhost:3003" },
    },
    {
      name: "messenger",
      testMatch: "messenger.spec.ts",
      use: { baseURL: "http://localhost:3000" },
    },
  ],
});
