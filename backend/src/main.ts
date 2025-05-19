import { id, User } from "@instantdb/admin";
import { apiHandler, ApiImplementation } from "typed-api";
import { backendApiSchema } from "./api.ts";
import { createConversation } from "./createConversation.ts";
import { auth, query, transact, tx } from "./db.ts";
import { callWebhooks } from "./notificationService.ts";

const createIdentityForAccount = async (
  { publicSignKey, publicEncryptKey, account }: {
    publicSignKey: string;
    publicEncryptKey: string;
    account: string;
  },
): Promise<{ success: true }> => {
  await transact(
    tx.identities[id()]
      .update({ publicSignKey, publicEncryptKey })
      .link({ account }),
  );
  return { success: true };
};

const endpoints: ApiImplementation<User, typeof backendApiSchema> = {
  authenticate: (token: string) => auth.verifyToken(token),
  handlers: {
    createConversation,
    notify: callWebhooks,
    createAccount: async () => {
      const accountId = id();
      const accessToken = crypto.randomUUID();
      await transact(tx.accounts[accountId].update({ accessToken }));
      return { success: true, accountId, accessToken };
    },
    createAnonymousIdentity: ({ publicSignKey, publicEncryptKey }) =>
      transact(
        tx.identities[id()].update({ publicSignKey, publicEncryptKey }),
      ),
    createIdentity: async ({ email }, { publicSignKey, publicEncryptKey }) => {
      const { accounts } = await query({
        accounts: { $: { where: { email } } },
      });
      await createIdentityForAccount({
        publicSignKey,
        publicEncryptKey,
        account: accounts[0].id,
      });
      return {}
    },
    setWebhook: async ({ email }, { url, publicSignKey }) => {
      const { identities } = await query({
        identities: {
          $: { where: { publicSignKey, "account.email": email } },
        },
      });
      if (identities.length === 0) {
        return {
          success: false,
          error: "identity-does-not-exist-or-not-owned",
        };
      }
      const identity = identities[0];
      await transact(tx.identities[identity.id].update({ webhook: url }));
      return { success: true };
    },
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
      await apiHandler(backendApiSchema, endpoints, await req.json()),
    ),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
});
