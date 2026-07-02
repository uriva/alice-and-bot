import { assertEquals } from "@std/assert";
import { startActiveReportingWith } from "./activeReporting.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

const dummyCredentials = {
  publicSignKey: "pub-key-123",
  privateSignKey: "priv-key-456",
} as unknown as Credentials;

Deno.test("startActiveReporting - catches reportActive errors", async () => {
  let callCount = 0;
  const failingReportActive = () => {
    callCount++;
    return Promise.reject(new TypeError("Failed to fetch"));
  };

  const cleanup = startActiveReportingWith(failingReportActive)(dummyCredentials);
  
  await new Promise((resolve) => setTimeout(resolve, 50));
  
  cleanup();
  assertEquals(callCount, 1);
});
