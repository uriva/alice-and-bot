import { assertEquals, assertRejects } from "@std/assert";
import { isRetryableInstantDbError, retryInstantDbOp } from "./db.ts";

const fastRetry = retryInstantDbOp({
  initialDelayMs: 1,
  maxDelayMs: 4,
  maxAttempts: 4,
});

Deno.test("isRetryableInstantDbError detects rate limits and transient errors", () => {
  assertEquals(isRetryableInstantDbError({ status: 429 }), true);
  assertEquals(isRetryableInstantDbError({ status: 502 }), true);
  assertEquals(isRetryableInstantDbError({ status: 503 }), true);
  assertEquals(
    isRetryableInstantDbError({
      body: {
        type: "rate-limited",
        message: "Your request exceeded the rate limit.",
      },
    }),
    true,
  );
  assertEquals(
    isRetryableInstantDbError(
      new Error("InstantAPIError: Your request exceeded the rate limit."),
    ),
    true,
  );
  assertEquals(isRetryableInstantDbError(new Error("fetch failed")), true);
  assertEquals(
    isRetryableInstantDbError(new Error("Invalid query syntax")),
    false,
  );
  assertEquals(isRetryableInstantDbError(null), false);
});

Deno.test("retryInstantDbOp retries rate-limited operations until they succeed", async () => {
  const state = { attempts: 0 };
  const result = await fastRetry(() => {
    state.attempts += 1;
    if (state.attempts < 3) {
      return Promise.reject(
        Object.assign(
          new Error("InstantAPIError: Your request exceeded the rate limit."),
          { status: 429, body: { type: "rate-limited" } },
        ),
      );
    }
    return Promise.resolve({ ok: true });
  });
  assertEquals(state.attempts, 3);
  assertEquals(result, { ok: true });
});

Deno.test("retryInstantDbOp does not retry non-retryable errors", async () => {
  const state = { attempts: 0 };
  await assertRejects(
    () =>
      fastRetry(() => {
        state.attempts += 1;
        return Promise.reject(new Error("Validation error: invalid link"));
      }),
    Error,
    "Validation error: invalid link",
  );
  assertEquals(state.attempts, 1);
});

Deno.test("retryInstantDbOp stops after maxAttempts on persistent rate limiting", async () => {
  const state = { attempts: 0 };
  await assertRejects(
    () =>
      fastRetry(() => {
        state.attempts += 1;
        return Promise.reject(
          new Error("Your request exceeded the rate limit."),
        );
      }),
    Error,
    "Your request exceeded the rate limit.",
  );
  assertEquals(state.attempts, 4);
});
