import { init } from "@instantdb/admin";
import { coerce } from "@uri/gamla";
import schema from "../../instant.schema.ts";
import { instantAppId } from "../../protocol/src/clientApi.ts";

export const { auth, query, tx, transact } = init({
  appId: instantAppId,
  adminToken: coerce(Deno.env.get("INSTANT_ADMIN_TOKEN")),
  schema,
});
