import { assertEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { startActiveReportingWith } from "./activeReporting.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

const dummyCredentials: Credentials = {
  publicSignKey: "pub-key-123",
  privateSignKey: "priv-key-456",
  privateEncryptKey: "enc-key-789",
};

Deno.test("startActiveReporting - catches reportActive errors", async () => {
  const calls: number[] = [];
  const failingReportActive = () => {
    calls.push(1);
    return Promise.reject(new TypeError("Failed to fetch"));
  };

  const cleanup = startActiveReportingWith(failingReportActive)(
    dummyCredentials,
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  cleanup();
  assertEquals(calls.length, 1);
});

Deno.test(
  "startActiveReporting - skips periodic heartbeats while document is hidden",
  () => {
    const time = new FakeTime();
    const calls: number[] = [];
    const origDoc = globalThis.document;
    const state = { visibilityState: "hidden" };
    Object.defineProperty(globalThis, "document", {
      value: {
        get visibilityState() {
          return state.visibilityState;
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      configurable: true,
    });

    const cleanup = startActiveReportingWith(() => {
      calls.push(1);
      return Promise.resolve();
    })(dummyCredentials);

    time.tick(90_000);
    cleanup();
    Object.defineProperty(globalThis, "document", {
      value: origDoc,
      configurable: true,
    });
    time.restore();

    assertEquals(calls.length, 0);
  },
);
