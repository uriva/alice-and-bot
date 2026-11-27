import { init, type InstantAdminDatabase } from "@instantdb/admin";
import { coerce, sleep } from "@uri/gamla";
import schema from "../../instant.schema.ts";
import { instantApiUri, instantAppId } from "../../protocol/src/clientApi.ts";

type Db = InstantAdminDatabase<typeof schema>;

type RetryConfig = {
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
};

export const defaultRetryConfig: RetryConfig = {
  initialDelayMs: 500,
  maxDelayMs: 5_000,
  maxAttempts: 3,
};

const retryableStatuses = new Set([429, 500, 502, 503, 504]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRetryableMessage = (msg: string) => {
  const lower = msg.toLowerCase();
  return lower.includes("rate limit") ||
    lower.includes("rate-limited") ||
    lower.includes("fetch failed") ||
    lower.includes("timeout");
};

export const isRetryableInstantDbError = (err: unknown) => {
  if (!isRecord(err)) return false;
  if (typeof err.status === "number" && retryableStatuses.has(err.status)) {
    return true;
  }
  if (isRecord(err.body)) {
    if (err.body.type === "rate-limited") return true;
    if (
      typeof err.body.message === "string" &&
      isRetryableMessage(err.body.message)
    ) {
      return true;
    }
  }
  return typeof err.message === "string" && isRetryableMessage(err.message);
};

const retryWithBackoff = <Res>(
  fn: () => Promise<Res>,
  config: RetryConfig,
  attempt: number,
): Promise<Res> =>
  fn().catch(async (err) => {
    if (!isRetryableInstantDbError(err) || attempt >= config.maxAttempts) {
      throw err;
    }
    const delayMs = Math.min(
      config.maxDelayMs,
      config.initialDelayMs * 2 ** (attempt - 1),
    );
    await sleep(delayMs);
    return retryWithBackoff(fn, config, attempt + 1);
  });

export const retryInstantDbOp = (config: RetryConfig) =>
<Res>(
  fn: () => Promise<Res>,
): Promise<Res> => retryWithBackoff(fn, config, 1);

const withDefaultRetry = retryInstantDbOp(defaultRetryConfig);

const dbCache: { instance: Db | null; token: string } = {
  instance: null,
  token: "",
};

const readDotEnvToken = (): string | undefined => {
  try {
    const raw = Deno.readTextFileSync(new URL("../../.env", import.meta.url));
    const line = raw
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith("INSTANT_ADMIN_TOKEN="));
    if (!line) return undefined;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
};

const resolveAdminToken = (): string =>
  Deno.env.get("INSTANT_ADMIN_TOKEN") ||
  readDotEnvToken() ||
  "dummy-admin-token";

export const getDb = (): Db => {
  const token = coerce(resolveAdminToken());
  if (!dbCache.instance || token !== dbCache.token) {
    dbCache.token = token;
    dbCache.instance = init({
      appId: instantAppId,
      adminToken: token,
      apiURI: instantApiUri,
      schema,
    });
  }
  return dbCache.instance;
};

const dummyDb: Db = init({
  appId: instantAppId,
  adminToken: "dummy-admin-token",
  apiURI: instantApiUri,
  schema,
});

export const wrapAuthWithRetry =
  (retry: ReturnType<typeof retryInstantDbOp>) =>
  <T extends object>(getTarget: () => T): T =>
    new Proxy(getTarget(), {
      get(_target, prop) {
        const targetAuth = getTarget();
        const val = Reflect.get(targetAuth, prop);
        return typeof val === "function"
          ? (...args: unknown[]) =>
            retry(() => Promise.resolve(val.apply(targetAuth, args)))
          : val;
      },
    });

export const auth: Db["auth"] = wrapAuthWithRetry(withDefaultRetry)(
  () => getDb().auth,
);

export const query: Db["query"] = (q) =>
  withDefaultRetry(() => getDb().query(q));

export const transact: Db["transact"] = (chunks) =>
  withDefaultRetry(() => getDb().transact(chunks));

export const tx: Db["tx"] = dummyDb.tx;
