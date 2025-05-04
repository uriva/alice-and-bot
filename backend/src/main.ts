import { callWebhooks } from "./notificationService.ts";
import { typedApiHandler, TypedApiImplementation } from "typed-api";
import { auth, query, transact, tx } from "./db.ts";
import { id, User as InstantUser } from "@instantdb/admin";
import { createConversation } from "./createConversation.ts";
import { BackendApi } from "./api.ts";

const endpoints: TypedApiImplementation<InstantUser, BackendApi> = {
  createConversation,
  notify: callWebhooks,
  createIdentity: async ({ email }, { publicSignKey, publicEncryptKey }) => {
    const { accounts } = await query({ accounts: { $: { where: { email } } } });
    await transact(
      tx.identities[id()]
        .update({ publicSignKey, publicEncryptKey })
        .link({ account: accounts[0].id }),
    );
    return { success: true };
  },
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const respondCors = (x: null | BodyInit, y: ResponseInit) =>
  new Response(x, { ...y, headers: { ...corsHeaders, ...y.headers } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return respondCors(null, { status: 204 });
  return respondCors(
    JSON.stringify(
      await typedApiHandler(
        endpoints,
        (token) => auth.verifyToken(token),
        await req.json(),
      ),
    ),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
});
