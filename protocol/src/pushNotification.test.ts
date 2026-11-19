import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  type Credentials,
  type InternalMessage,
  isSilentMessage,
  msgToStr,
} from "./clientApi.ts";
import {
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "./crypto.ts";
import { createMemoryPushKeyStore } from "./pushKeyStore.ts";
import {
  formatMessagePreview,
  handleServiceWorkerNotificationClick,
  handleServiceWorkerPush,
  isConversationFocused,
  notificationBadgePath,
  type ShownNotificationRecord,
  stripMarkdownForPreview,
} from "./pushNotification.ts";

type TestParticipant = {
  credentials: Credentials;
  publicEncryptKey: string;
};

const makeTestParticipant = async (): Promise<TestParticipant> => {
  const [signPair, encPair] = await Promise.all([
    generateKeyPair("sign"),
    generateKeyPair("encrypt"),
  ]);
  return {
    credentials: {
      publicSignKey: signPair.publicKey,
      privateSignKey: signPair.privateKey,
      privateEncryptKey: encPair.privateKey,
    },
    publicEncryptKey: encPair.publicKey,
  };
};

const makeEncryptedSignedMessage = async (
  conversationKey: string,
  sender: Credentials,
  conversationId: string,
  message: InternalMessage,
) => {
  const payload = { ...message, conversationId, sentAt: Date.now() };
  return encryptSymmetric(conversationKey, {
    payload,
    publicSignKey: sender.publicSignKey,
    signature: await sign(sender.privateSignKey, msgToStr(payload)),
  });
};

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const createFakeRegistration = () => {
  const active = new Map<
    string,
    ShownNotificationRecord & { close: () => void }
  >();
  const shownHistory: ShownNotificationRecord[] = [];
  return {
    active,
    shownHistory,
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        const tag = typeof options.tag === "string" ? options.tag : "default";
        const record: ShownNotificationRecord & { close: () => void } = {
          title,
          tag,
          body: typeof options.body === "string" ? options.body : "",
          icon: typeof options.icon === "string" ? options.icon : "",
          badge: typeof options.badge === "string" ? options.badge : "",
          silent: Boolean(options.silent),
          renotify: Boolean(options.renotify),
          data: isPlainRecord(options.data) ? options.data : {},
          actions: Array.isArray(options.actions) ? options.actions : [],
          close: () => {
            active.delete(tag);
          },
        };
        active.set(tag, record);
        shownHistory.push(record);
        return Promise.resolve();
      },
      getNotifications: (filter?: { tag?: string }) => {
        const all = Array.from(active.values());
        return Promise.resolve(
          filter?.tag ? all.filter((n) => n.tag === filter.tag) : all,
        );
      },
    },
  };
};

Deno.test("isSilentMessage silences transient spinner, progress, canvas events, reaction removals, and call hangups", () => {
  assertEquals(
    isSilentMessage({
      type: "spinner",
      text: "Thinking...",
      active: true,
      elementId: "s1",
    }),
    true,
  );
  assertEquals(
    isSilentMessage({
      type: "progress",
      text: "Indexing",
      percentage: 50,
      elementId: "p1",
    }),
    true,
  );
  assertEquals(
    isSilentMessage({ type: "event", action: "click", data: null }),
    true,
  );
  assertEquals(
    isSilentMessage({
      type: "reaction",
      reactTo: "m1",
      emoji: "👍",
      remove: true,
    }),
    true,
  );
  assertEquals(
    isSilentMessage({ type: "call", callId: "c1", action: "end" }),
    true,
  );
  assertEquals(
    isSilentMessage({ type: "text", text: "Real reply" }),
    false,
  );
  assertEquals(
    isSilentMessage({
      type: "reaction",
      reactTo: "m1",
      emoji: "❤️",
    }),
    false,
  );
  assertEquals(
    isSilentMessage({ type: "call", callId: "c1", action: "offer" }),
    false,
  );
});

Deno.test("isConversationFocused only suppresses the exact open conversation and never drops other chats", () => {
  const clients = [
    { focused: true, url: "https://aliceandbot.com/chat?c=conv-alpha" },
  ];
  assertEquals(isConversationFocused(clients, "conv-alpha"), true);
  assertEquals(isConversationFocused(clients, "conv-beta"), false);
  assertEquals(
    isConversationFocused(
      [{ focused: false, url: "https://aliceandbot.com/chat?c=conv-alpha" }],
      "conv-alpha",
    ),
    false,
  );
});

Deno.test("stripMarkdownForPreview and formatMessagePreview produce clean WhatsApp-like previews", () => {
  assertEquals(
    stripMarkdownForPreview(
      "Check **Polymarket** [BTC > 100k](https://polymarket.com/btc) with `0.42` odds!",
    ),
    "Check Polymarket BTC > 100k with 0.42 odds!",
  );
  assertEquals(
    formatMessagePreview({
      type: "text",
      text: "",
      attachments: [
        {
          type: "audio",
          url: "https://example.com/a.ogg",
          name: "voice.ogg",
          size: 1024,
          mimeType: "audio/ogg",
          duration: 14,
        },
      ],
    }),
    "🎤 Voice message (0:14)",
  );
  assertEquals(
    formatMessagePreview({
      type: "text",
      text: "Chart snapshot",
      attachments: [
        {
          type: "image",
          url: "https://example.com/chart.png",
          name: "chart.png",
          size: 2048,
          mimeType: "image/png",
        },
      ],
    }),
    "📷 Chart snapshot",
  );
  assertEquals(
    formatMessagePreview({
      type: "reaction",
      reactTo: "m1",
      emoji: "🔥",
    }),
    "Reacted 🔥 to a message",
  );
  assertEquals(
    formatMessagePreview({
      type: "call",
      callId: "c1",
      action: "offer",
    }),
    "📞 Incoming voice call",
  );
});

Deno.test("handleServiceWorkerPush decrypts E2EE previews, stacks unread messages, renders circular avatar, and handles cross-device dismiss", async () => {
  const [alice, bot] = await Promise.all([
    makeTestParticipant(),
    makeTestParticipant(),
  ]);
  const symKey = await generateSymmetricKey();
  const aliceEncryptedConvKey = await encryptAsymmetric(
    alice.publicEncryptKey,
    symKey,
  );
  const keyStore = createMemoryPushKeyStore();
  await keyStore.setCredentials(alice.credentials);

  const { active, registration } = createFakeRegistration();
  const badgeUpdates: number[] = [];

  const msg1 = await makeEncryptedSignedMessage(
    symKey,
    bot.credentials,
    "conv-1",
    {
      type: "text",
      text: "Found **arb** at [42c](https://example.com)",
    },
  );
  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "m1",
      conversationId: "conv-1",
      conversationTitle: "Polymarket",
      senderName: "Arb Bot",
      senderPublicSignKey: bot.credentials.publicSignKey,
      isGroupChat: false,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: msg1,
    },
    registration,
    clients: {
      matchAll: () =>
        Promise.resolve([
          {
            focused: true,
            url: "https://aliceandbot.com/chat?c=other-conv",
          },
        ]),
    },
    keyStore,
    setAppBadge: (n) => {
      badgeUpdates.push(n);
      return Promise.resolve();
    },
    clearAppBadge: () => {
      badgeUpdates.push(0);
      return Promise.resolve();
    },
  });

  const first = active.get("conv-1");
  assertEquals(first?.title, "Arb Bot");
  assertEquals(first?.body, "Found arb at 42c");
  assertEquals(first?.badge, notificationBadgePath);
  assertStringIncludes(first?.icon ?? "", "data:image/");
  assertEquals(badgeUpdates, [1]);

  const msg2 = await makeEncryptedSignedMessage(
    symKey,
    bot.credentials,
    "conv-1",
    {
      type: "text",
      text: "Order filled!",
    },
  );
  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "m2",
      conversationId: "conv-1",
      conversationTitle: "Polymarket",
      senderName: "Arb Bot",
      senderPublicSignKey: bot.credentials.publicSignKey,
      isGroupChat: false,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: msg2,
    },
    registration,
    clients: { matchAll: () => Promise.resolve([]) },
    keyStore,
    setAppBadge: (n) => {
      badgeUpdates.push(n);
      return Promise.resolve();
    },
    clearAppBadge: () => {
      badgeUpdates.push(0);
      return Promise.resolve();
    },
  });

  const stacked = active.get("conv-1");
  assertEquals(stacked?.title, "Arb Bot (2 messages)");
  assertEquals(stacked?.body, "Found arb at 42c\nOrder filled!");
  assertEquals(badgeUpdates, [1, 2]);

  await handleServiceWorkerPush({
    data: {
      type: "dismiss",
      conversationId: "conv-1",
    },
    registration,
    clients: { matchAll: () => Promise.resolve([]) },
    keyStore,
    setAppBadge: (n) => {
      badgeUpdates.push(n);
      return Promise.resolve();
    },
    clearAppBadge: () => {
      badgeUpdates.push(0);
      return Promise.resolve();
    },
  });

  assertEquals(active.size, 0);
  assertEquals(badgeUpdates.at(-1), 0);
});

Deno.test("handleServiceWorkerNotificationClick switches open SPA client without reload, supports mark-read and inline E2EE reply", async () => {
  const [alice, bot] = await Promise.all([
    makeTestParticipant(),
    makeTestParticipant(),
  ]);
  const symKey = await generateSymmetricKey();
  const aliceEncryptedConvKey = await encryptAsymmetric(
    alice.publicEncryptKey,
    symKey,
  );
  const keyStore = createMemoryPushKeyStore();
  await keyStore.setCredentials(alice.credentials);
  await keyStore.setPushEndpoint("https://push.example/phone");

  const { active, registration } = createFakeRegistration();
  const msg = await makeEncryptedSignedMessage(
    symKey,
    bot.credentials,
    "conv-9",
    {
      type: "text",
      text: "Should I execute?",
    },
  );
  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "m9",
      conversationId: "conv-9",
      conversationTitle: "Exec",
      senderName: "Bot",
      senderPublicSignKey: bot.credentials.publicSignKey,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: msg,
    },
    registration,
    clients: { matchAll: () => Promise.resolve([]) },
    keyStore,
  });

  const postedMessages: unknown[] = [];
  const dismissedRemote: {
    conversationId: string;
    excludeEndpoint?: string;
  }[] = [];
  const sentReplies: { conversation: string; text: string }[] = [];
  const shown = active.get("conv-9")!;

  await handleServiceWorkerNotificationClick({
    action: "",
    notification: shown,
    registration,
    clients: {
      matchAll: () =>
        Promise.resolve([
          {
            url: "https://aliceandbot.com/chat?c=old",
            focus: () => Promise.resolve(),
            postMessage: (m: unknown) => {
              postedMessages.push(m);
            },
          },
        ]),
      openWindow: () => Promise.resolve(),
    },
    keyStore,
    dismissRemoteFn: (_creds, payload) => {
      dismissedRemote.push(payload);
      return Promise.resolve({ success: true as const });
    },
  });

  assertEquals(active.size, 0);
  assertEquals(postedMessages, [
    { type: "alice:select-conversation", conversationId: "conv-9" },
  ]);
  assertEquals(dismissedRemote, [
    { conversationId: "conv-9", excludeEndpoint: "https://push.example/phone" },
  ]);

  await handleServiceWorkerNotificationClick({
    action: "reply",
    reply: "Yes, go ahead!",
    notification: shown,
    registration,
    clients: {
      matchAll: () => Promise.resolve([]),
      openWindow: () => Promise.resolve(),
    },
    keyStore,
    sendReplyFn: ({ conversation, message }) => {
      sentReplies.push({
        conversation,
        text: message.type === "text" ? message.text : "",
      });
      return Promise.resolve({ messageId: "reply-1" });
    },
  });

  assertEquals(sentReplies, [
    { conversation: "conv-9", text: "Yes, go ahead!" },
  ]);
});

Deno.test("handleServiceWorkerPush fetches oversized ciphertext by messageId, prefixes sender in group chats, and updates in-place on edit", async () => {
  const [alice, bot1, bot2] = await Promise.all([
    makeTestParticipant(),
    makeTestParticipant(),
    makeTestParticipant(),
  ]);
  const symKey = await generateSymmetricKey();
  const aliceEncryptedConvKey = await encryptAsymmetric(
    alice.publicEncryptKey,
    symKey,
  );
  const keyStore = createMemoryPushKeyStore();
  await keyStore.setCredentials(alice.credentials);

  const { active, registration } = createFakeRegistration();
  const oversizedCiphertext = await makeEncryptedSignedMessage(
    symKey,
    bot1.credentials,
    "group-1",
    {
      type: "text",
      text: "Initial draft report",
    },
  );

  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "big-m1",
      conversationId: "group-1",
      conversationTitle: "Ops Room",
      senderName: "Analyst",
      senderPublicSignKey: bot1.credentials.publicSignKey,
      isGroupChat: true,
      conversationKey: aliceEncryptedConvKey,
    },
    registration,
    clients: { matchAll: () => Promise.resolve([]) },
    keyStore,
    fetchLatestCiphertext: ({ messageId }) =>
      Promise.resolve(messageId === "big-m1" ? oversizedCiphertext : null),
  });

  const afterFirst = active.get("group-1");
  assertEquals(afterFirst?.title, "Ops Room");
  assertEquals(afterFirst?.body, "Analyst: Initial draft report");

  const editCiphertext = await makeEncryptedSignedMessage(
    symKey,
    bot1.credentials,
    "group-1",
    {
      type: "edit",
      editOf: "big-m1",
      text: "Final verified report",
    },
  );
  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "edit-m1",
      conversationId: "group-1",
      conversationTitle: "Ops Room",
      senderName: "Analyst",
      senderPublicSignKey: bot1.credentials.publicSignKey,
      isGroupChat: true,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: editCiphertext,
    },
    registration,
    clients: { matchAll: () => Promise.resolve([]) },
    keyStore,
  });

  const afterEdit = active.get("group-1");
  assertEquals(afterEdit?.title, "Ops Room");
  assertEquals(afterEdit?.body, "Analyst: Final verified report");
  assertEquals(afterEdit?.renotify, false);
  assertEquals(afterEdit?.silent, true);

  const reply2Ciphertext = await makeEncryptedSignedMessage(
    symKey,
    bot2.credentials,
    "group-1",
    {
      type: "text",
      text: "Approved",
    },
  );
  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "m2",
      conversationId: "group-1",
      conversationTitle: "Ops Room",
      senderName: "Reviewer",
      senderPublicSignKey: bot2.credentials.publicSignKey,
      isGroupChat: true,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: reply2Ciphertext,
    },
    registration,
    clients: { matchAll: () => Promise.resolve([]) },
    keyStore,
  });

  const afterSecond = active.get("group-1");
  assertEquals(afterSecond?.title, "Ops Room (2 messages)");
  assertEquals(
    afterSecond?.body,
    "Analyst: Final verified report\nReviewer: Approved",
  );
});

Deno.test("handleServiceWorkerPush caches pushed ciphertext in keyStore and posts instant update to background chat window", async () => {
  const [alice, bot] = await Promise.all([
    makeTestParticipant(),
    makeTestParticipant(),
  ]);
  const symKey = await generateSymmetricKey();
  const aliceEncryptedConvKey = await encryptAsymmetric(
    alice.publicEncryptKey,
    symKey,
  );
  const keyStore = createMemoryPushKeyStore();
  await keyStore.setCredentials(alice.credentials);
  const { registration } = createFakeRegistration();
  const backgroundMessages: unknown[] = [];

  const cipher = await makeEncryptedSignedMessage(
    symKey,
    bot.credentials,
    "conv-instant",
    { type: "text", text: "Instant push body" },
  );

  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "m-push-1",
      conversationId: "conv-instant",
      conversationTitle: "Bot",
      senderName: "Bot",
      senderPublicSignKey: bot.credentials.publicSignKey,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: cipher,
      timestamp: 1700000000123,
    },
    registration,
    clients: {
      matchAll: () =>
        Promise.resolve([
          {
            focused: false,
            url: "https://aliceandbot.com/chat?c=conv-instant",
            postMessage: (msg: unknown) => {
              backgroundMessages.push(msg);
            },
          },
        ]),
    },
    keyStore,
  });

  const cachedMsgs = await keyStore.getConversationMessages("conv-instant");
  assertEquals(cachedMsgs, [
    { id: "m-push-1", payload: cipher, timestamp: 1700000000123 },
  ]);
  assertEquals(backgroundMessages, [
    {
      type: "alice:push-message",
      conversationId: "conv-instant",
      conversationKey: symKey,
      message: { id: "m-push-1", payload: cipher, timestamp: 1700000000123 },
    },
  ]);
});

Deno.test("handleServiceWorkerNotificationClick focuses chat window before slow keyStore or remote dismiss completes", async () => {
  const keyStore = createMemoryPushKeyStore();
  const gate = Promise.withResolvers<null>();
  const slowKeyStore = {
    ...keyStore,
    getCredentials: () => gate.promise,
  };
  const { registration } = createFakeRegistration();
  const events: string[] = [];

  const clickDone = handleServiceWorkerNotificationClick({
    action: "",
    notification: {
      tag: "conv-fast",
      data: { conversationId: "conv-fast" },
      close: () => {
        events.push("closed");
      },
    },
    registration,
    clients: {
      matchAll: () =>
        Promise.resolve([
          {
            url: "https://aliceandbot.com/chat",
            postMessage: () => {
              events.push("posted");
            },
            focus: () => {
              events.push("focused");
              return Promise.resolve();
            },
          },
        ]),
    },
    keyStore: slowKeyStore,
  });

  await new Promise((r) => setTimeout(r, 10));
  assertEquals(events, ["closed", "posted", "focused"]);
  gate.resolve(null);
  await clickDone;
});

Deno.test("handleServiceWorkerPush suppresses notifications for SPA-navigated focused/visible conversation even when client.url lacks ?c= or holds stale ?c=", async () => {
  const [alice, bot] = await Promise.all([
    makeTestParticipant(),
    makeTestParticipant(),
  ]);
  const symKey = await generateSymmetricKey();
  const aliceEncryptedConvKey = await encryptAsymmetric(
    alice.publicEncryptKey,
    symKey,
  );
  const keyStore = createMemoryPushKeyStore();
  await keyStore.setCredentials(alice.credentials);

  const makeSpaClient = ({
    url,
    focused,
    visibilityState,
    activeConversationId,
  }: {
    url: string;
    focused: boolean;
    visibilityState: string;
    activeConversationId: string | null;
  }) => ({
    url,
    focused,
    visibilityState,
    postMessage: (msg: unknown, transfer?: Transferable[]) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        "type" in msg &&
        msg.type === "alice:query-active-conversation" &&
        transfer?.[0] instanceof MessagePort
      ) {
        const port = transfer[0];
        port.postMessage({ conversationId: activeConversationId });
        port.close();
      }
    },
  });

  const cipherNew = await makeEncryptedSignedMessage(
    symKey,
    bot.credentials,
    "conv-new",
    { type: "text", text: "You are staring right at me" },
  );
  const { active: active1, registration: reg1 } = createFakeRegistration();
  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "m-spa-1",
      conversationId: "conv-new",
      conversationTitle: "Bot",
      senderName: "Bot",
      senderPublicSignKey: bot.credentials.publicSignKey,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: cipherNew,
    },
    registration: reg1,
    clients: {
      matchAll: () =>
        Promise.resolve([
          makeSpaClient({
            url: "https://aliceandbot.com/chat",
            focused: false,
            visibilityState: "visible",
            activeConversationId: "conv-new",
          }),
        ]),
    },
    keyStore,
  });
  assertEquals(active1.size, 0);

  const cipherOld = await makeEncryptedSignedMessage(
    symKey,
    bot.credentials,
    "conv-old",
    { type: "text", text: "Message in old convo after switching away" },
  );
  const { active: active2, registration: reg2 } = createFakeRegistration();
  await handleServiceWorkerPush({
    data: {
      type: "message",
      messageId: "m-spa-2",
      conversationId: "conv-old",
      conversationTitle: "Old Bot",
      senderName: "Old Bot",
      senderPublicSignKey: bot.credentials.publicSignKey,
      conversationKey: aliceEncryptedConvKey,
      encryptedMessage: cipherOld,
    },
    registration: reg2,
    clients: {
      matchAll: () =>
        Promise.resolve([
          makeSpaClient({
            url: "https://aliceandbot.com/chat?c=conv-old",
            focused: true,
            visibilityState: "visible",
            activeConversationId: "conv-new",
          }),
        ]),
    },
    keyStore,
  });
  assertEquals(active2.size, 1);
  assertEquals(
    active2.get("conv-old")?.body,
    "Message in old convo after switching away",
  );
});
