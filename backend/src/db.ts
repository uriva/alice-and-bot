import { init, type InstantAdminDatabase } from "@instantdb/admin";
import { coerce } from "@uri/gamla";
import schema from "../../instant.schema.ts";
import { instantAppId } from "../../protocol/src/clientApi.ts";

type Db = InstantAdminDatabase<typeof schema>;

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

const getDb = (): Db => {
  const token = coerce(resolveAdminToken());
  if (!dbCache.instance || token !== dbCache.token) {
    dbCache.token = token;
    dbCache.instance = init({
      appId: instantAppId,
      adminToken: token,
      schema,
    });
  }
  return dbCache.instance;
};

const dummyDb: Db = init({
  appId: instantAppId,
  adminToken: "dummy-admin-token",
  schema,
});

export const auth: Db["auth"] = new Proxy(dummyDb.auth, {
  get(_target, prop) {
    const targetAuth = getDb().auth;
    const val = Reflect.get(targetAuth, prop);
    return typeof val === "function" ? val.bind(targetAuth) : val;
  },
});

export const query: Db["query"] = (q) => getDb().query(q);

export const transact: Db["transact"] = (chunks) => getDb().transact(chunks);

export const tx: Db["tx"] = dummyDb.tx;
