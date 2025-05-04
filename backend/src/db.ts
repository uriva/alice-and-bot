import { init } from "@instantdb/admin";
import schema from "../../instant.schema.ts";
import { instantAppId } from "../../protocol/src/api.ts";

export const adminToken = "ef7dc3c0-6453-4257-9f92-31e5df140656";

export const { auth, query, tx, transact } = init({
  appId: instantAppId,
  adminToken,
  schema,
});
