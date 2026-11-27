import { assertEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { startActiveReportingWith } from "./activeReporting.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

const dummyCredentials: Credentials = {
  publicSignKey: "pub-key-123",
  privateSignKey: "priv-key-456",
  privateEncryptKey: "enc-key-789",
};

Deno.test(
  "startActiveReportingWith is a no-op that starts no heartbeat timer or calls",
  () => {
    const time = new FakeTime();
    const calls: number[] = [];
    const cleanup = startActiveReportingWith(() => {
      calls.push(1);
      return Promise.resolve();
    })(dummyCredentials);

    time.tick(90_000);
    cleanup();
    time.restore();

    assertEquals(calls.length, 0);
  },
);
