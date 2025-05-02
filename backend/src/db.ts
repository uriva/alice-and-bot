import { init } from "@instantdb/admin";
import { coerce } from "gamla";
import schema from "../../instant.schema.ts";

const INSTANT_APP_ID = Deno.env.get("INSTANT_APP_ID");
const INSTANT_ADMIN_TOKEN = Deno.env.get("INSTANT_ADMIN_TOKEN");

export const { auth, query, tx, transact } = init({
  appId: coerce(INSTANT_APP_ID),
  adminToken: coerce(INSTANT_ADMIN_TOKEN),
  schema,
});
