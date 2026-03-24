const kv = await Deno.openKv();

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const storeMessage = async (token: string, req: Request) => {
  const body = await req.json();
  await kv.set(["msg", token, crypto.randomUUID()], body, {
    expireIn: 3600_000,
  });
  return jsonResponse({ ok: true });
};

const drainMessages = async (token: string) => {
  const entries: Deno.KvEntry<unknown>[] = [];
  for await (const entry of kv.list({ prefix: ["msg", token] })) {
    entries.push(entry);
  }
  const op = kv.atomic();
  entries.forEach(({ key }) => op.delete(key));
  await op.commit();
  return jsonResponse({ messages: entries.map(({ value }) => value) });
};

Deno.serve((req) => {
  const { pathname } = new URL(req.url);
  const [, action, token] = pathname.split("/");
  if (req.method === "POST" && action === "webhook" && token) {
    return storeMessage(token, req);
  }
  if (req.method === "GET" && action === "poll" && token) {
    return drainMessages(token);
  }
  return jsonResponse({ error: "not found" }, 404);
});
