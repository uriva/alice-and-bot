import { init } from "@instantdb/admin";
import { coerce } from "gamla";
import { WebhookSentUpdate } from "../../protocol/src/api.ts";
import schema from "../../instant.schema.ts";

const INSTANT_APP_ID = Deno.env.get("INSTANT_APP_ID");
const INSTANT_ADMIN_TOKEN = Deno.env.get("INSTANT_ADMIN_TOKEN");

const { query } = init({
  appId: coerce(INSTANT_APP_ID),
  adminToken: coerce(INSTANT_ADMIN_TOKEN),
  schema,
});

const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const callWebhooks = async (messageId: string) => {
  const { messages } = await query({
    messages: {
      conversation: { participants: { webhooks: {} } },
      $: { where: { id: messageId } },
    },
  });
  if (!messages.length) return;
  const message = messages[0];
  const conversation = coerce(message.conversation);
  const webhooks = conversation.participants.flatMap(({ webhooks }) =>
    webhooks
  );
  const update: WebhookSentUpdate = {
    conversationId: conversation.id,
    payload: message.payload,
    timestamp: message.timestamp,
  };
  for (const webhook of webhooks) {
    fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    }).catch(() => {
      console.error("Failed to call webhook", webhook.url);
    });
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  const { messageId } = await req.json();
  if (!messageId) {
    return new Response(JSON.stringify({ error: "Missing `messageId`" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
  await callWebhooks(messageId);
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
});
