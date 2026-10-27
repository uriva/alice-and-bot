import { init, type InstantAdminDatabase } from "@instantdb/admin";
import { coerce } from "@uri/gamla";
import schema from "../../instant.schema.ts";
import { instantAppId } from "../../protocol/src/clientApi.ts";

type Db = InstantAdminDatabase<typeof schema>;

let dbInstance: Db | null = null;
let lastToken = "";

const getDb = (): Db => {
  const token = coerce(
    Deno.env.get("INSTANT_ADMIN_TOKEN") ?? "dummy-admin-token",
  );
  if (!dbInstance || token !== lastToken) {
    lastToken = token;
    dbInstance = init({
      appId: instantAppId,
      adminToken: token,
      schema,
    });
  }
  return dbInstance;
};

const dummyDb: Db = init({
  appId: instantAppId,
  adminToken: "dummy-admin-token",
  schema,
});

export const auth: Db["auth"] = new Proxy(dummyDb.auth, {
  get(_target, prop) {
    const val = (getDb().auth as unknown as Record<string | symbol, unknown>)[
      prop
    ];
    return typeof val === "function" ? val.bind(getDb().auth) : val;
  },
});

export const query: Db["query"] =
  ((...args: unknown[]) =>
    (getDb().query as (...a: unknown[]) => unknown)(
      ...args,
    )) as unknown as Db["query"];

export const transact: Db["transact"] =
  ((...args: unknown[]) =>
    (getDb().transact as (...a: unknown[]) => unknown)(
      ...args,
    )) as unknown as Db["transact"];

export const tx: Db["tx"] = dummyDb.tx;
