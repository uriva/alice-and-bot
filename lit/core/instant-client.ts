import { init } from "@instantdb/core";
import { init as adminInit } from "@instantdb/admin";
import schema from "../../instant.schema.ts";
import { instantAppId } from "../../protocol/src/clientApi.ts";

type CoreDb = ReturnType<typeof init<typeof schema>>;
type AdminDb = ReturnType<typeof adminInit<typeof schema>>;

let coreDb: CoreDb | null = null;
let aDb: AdminDb | null = null;

export const accessDb = (): CoreDb => {
  if (!coreDb) {
    coreDb = init({ appId: instantAppId, schema, devtool: false });
  }
  return coreDb;
};

export const accessAdminDb = (): AdminDb => {
  if (!aDb) {
    aDb = adminInit({ appId: instantAppId, schema }).asUser({ guest: true });
  }
  return aDb;
};
