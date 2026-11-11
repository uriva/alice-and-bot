import { assertEquals } from "@std/assert";
import { id } from "@instantdb/admin";
import webpush from "web-push";
import { base64ToBase64Url } from "../../protocol/src/crypto.ts";
import { query, transact, tx } from "./db.ts";
import { endpoints, setRequestWaitUntil } from "./main.ts";

const toBase64Url = (buf: ArrayBuffer) =>
  base64ToBase64Url(btoa(String.fromCharCode(...new Uint8Array(buf))));

const makeRealPushSubscription = async (endpoint: string) => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const p256dh = toBase64Url(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  const auth = toBase64Url(authBytes.buffer);
  return { endpoint, expirationTime: null, keys: { p256dh, auth } };
};

type ReceivedPush = {
  path: string;
  urgency: string | null;
  ttl: string | null;
  bodyBytes: number;
};

Deno.test(
  "sendPushToParticipants delivers high-urgency push to recently active recipient while skipping sender",
  async () => {
    const vapid = webpush.generateVAPIDKeys();
    Deno.env.set("VAPID_PUBLIC_KEY", vapid.publicKey);
    Deno.env.set("VAPID_PRIVATE_KEY", vapid.privateKey);

    const received: ReceivedPush[] = [];
    const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
      const url = new URL(req.url);
      const body = await req.arrayBuffer();
      received.push({
        path: url.pathname,
        urgency: req.headers.get("urgency"),
        ttl: req.headers.get("ttl"),
        bodyBytes: body.byteLength,
      });
      return new Response("", {
        status: url.pathname === "/stale" ? 410 : 201,
      });
    });

    const port = server.addr.port;
    const aliceId = id();
    const botId = id();
    const convoId = id();
    const aliceSubId = id();
    const aliceStaleSubId = id();
    const botSubId = id();
    const aliceKey = `test-alice-${aliceId}`;
    const botKey = `test-bot-${botId}`;

    const [aliceSub, aliceStaleSub, botSub] = await Promise.all([
      makeRealPushSubscription(`http://127.0.0.1:${port}/alice`),
      makeRealPushSubscription(`http://127.0.0.1:${port}/stale`),
      makeRealPushSubscription(`http://127.0.0.1:${port}/bot`),
    ]);

    await transact([
      tx.identities[aliceId].update({
        name: "Alice",
        publicSignKey: aliceKey,
        publicEncryptKey: "enc-alice",
        lastActiveAt: Date.now(),
      }),
      tx.identities[botId].update({
        name: "Arb Bot",
        publicSignKey: botKey,
        publicEncryptKey: "enc-bot",
        lastActiveAt: Date.now() - 120_000,
      }),
      tx.conversations[convoId]
        .update({ title: "Polymarket Chat", updatedAt: Date.now() })
        .link({ participants: [aliceId, botId] }),
      tx.pushSubscriptions[aliceSubId]
        .update({
          endpoint: aliceSub.endpoint,
          subscription: aliceSub,
          createdAt: Date.now(),
        })
        .link({ owner: aliceId }),
      tx.pushSubscriptions[aliceStaleSubId]
        .update({
          endpoint: aliceStaleSub.endpoint,
          subscription: aliceStaleSub,
          createdAt: Date.now(),
        })
        .link({ owner: aliceId }),
      tx.pushSubscriptions[botSubId]
        .update({
          endpoint: botSub.endpoint,
          subscription: botSub,
          createdAt: Date.now(),
        })
        .link({ owner: botId }),
    ]);

    const bgTasks: Promise<unknown>[] = [];
    setRequestWaitUntil((p) => bgTasks.push(p));
    const { messageId } = await endpoints.handlers.sendMessage({
      conversation: convoId,
      encryptedMessage: "test-ciphertext",
      senderPublicSignKey: botKey,
    });
    await Promise.all(bgTasks);
    setRequestWaitUntil(undefined);

    const { pushSubscriptions: remainingStale } = await query({
      pushSubscriptions: { $: { where: { id: aliceStaleSubId } } },
    });

    await transact([
      tx.messages[messageId].delete(),
      tx.pushSubscriptions[aliceSubId].delete(),
      tx.pushSubscriptions[aliceStaleSubId].delete(),
      tx.pushSubscriptions[botSubId].delete(),
      tx.conversations[convoId].delete(),
      tx.identities[aliceId].delete(),
      tx.identities[botId].delete(),
    ]);
    await server.shutdown();

    const paths = received.map((r) => r.path).sort();
    assertEquals(paths, ["/alice", "/stale"]);
    const alicePush = received.find((r) => r.path === "/alice");
    assertEquals(alicePush?.urgency, "high");
    assertEquals(alicePush?.ttl, "86400");
    assertEquals((alicePush?.bodyBytes ?? 0) > 0, true);
    assertEquals(remainingStale.length, 0);
  },
);
