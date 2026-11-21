import { assertEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import {
  type Credentials,
  type DecipheredMessage,
  type EncryptedConversationKey,
  type EncryptedMessage,
  type InternalMessage,
  msgToStr,
} from "../../protocol/src/clientApi.ts";
import {
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "../../protocol/src/crypto.ts";
import { createMemoryPushKeyStore } from "../../protocol/src/pushKeyStore.ts";
import {
  activeTypingNamesForConversation,
  type ConversationPreview,
  type ConversationPreviewMap,
  type ConversationTypingMap,
  extractLatestPreview,
  formatConversationPreviewLine,
  formatConversationTime,
  formatConversationTypingLabel,
  makeCreateConversationPreviewsManager,
  makeSubscribeAllTypingStates,
  notifyConversationMessages,
} from "./conversation-previews.ts";
import { typingTtl } from "./subscriptions.ts";

const makeTestIdentity = async () => {
  const signKeys = await generateKeyPair("sign");
  const encKeys = await generateKeyPair("encrypt");
  const credentials: Credentials = {
    publicSignKey: signKeys.publicKey,
    privateSignKey: signKeys.privateKey,
    privateEncryptKey: encKeys.privateKey,
  };
  return { credentials, publicEncryptKey: encKeys.publicKey };
};

const makeEncryptedDbMessage = async ({
  id,
  conversationId,
  symKey,
  sender,
  message,
  timestamp,
}: {
  id: string;
  conversationId: string;
  symKey: string;
  sender: Credentials;
  message: InternalMessage;
  timestamp: number;
}): Promise<{ id: string; payload: EncryptedMessage; timestamp: number }> => {
  const payloadWithContext = {
    ...message,
    conversationId,
    sentAt: timestamp,
  };
  const signature = await sign(
    sender.privateSignKey,
    msgToStr(payloadWithContext),
  );
  const payload = await encryptSymmetric(symKey, {
    payload: payloadWithContext,
    publicSignKey: sender.publicSignKey,
    signature,
  });
  return { id, payload, timestamp };
};

Deno.test("extractLatestPreview skips silent messages and strips markdown", () => {
  const messages: DecipheredMessage[] = [
    {
      id: "m3",
      type: "event",
      action: "click",
      data: {},
      publicSignKey: "bob",
      timestamp: 3000,
      text: "",
    },
    {
      id: "m2",
      type: "spinner",
      active: true,
      elementId: "sp1",
      publicSignKey: "bob",
      timestamp: 2500,
      text: "Thinking...",
    },
    {
      id: "m1",
      type: "text",
      publicSignKey: "bob",
      timestamp: 2000,
      text: "**Hello** _world_!\nSecond line",
    },
  ];
  assertEquals(extractLatestPreview(messages, 3000), {
    text: "Hello world! Second line",
    timestamp: 2000,
    authorPublicSignKey: "bob",
    updatedAt: 3000,
  });
});

Deno.test("extractLatestPreview handles attachments, reactions, edits, calls, and empty chats", () => {
  assertEquals(
    extractLatestPreview(
      [{
        id: "m1",
        type: "text",
        publicSignKey: "bob",
        timestamp: 1000,
        text: "",
        attachments: [{
          type: "audio",
          url: "https://example.com/a.webm",
          name: "a.webm",
          size: 100,
          mimeType: "audio/webm",
          duration: 14,
        }],
      }],
      1000,
    ).text,
    "🎤 Voice message (0:14)",
  );

  assertEquals(
    extractLatestPreview(
      [
        {
          id: "m2",
          type: "reaction",
          reactTo: "m1",
          emoji: "🔥",
          remove: true,
          publicSignKey: "bob",
          timestamp: 2000,
          text: "",
        },
        {
          id: "m1",
          type: "reaction",
          reactTo: "m0",
          emoji: "👍",
          publicSignKey: "bob",
          timestamp: 1500,
          text: "",
        },
      ],
      2000,
    ).text,
    "Reacted 👍 to a message",
  );

  assertEquals(
    extractLatestPreview(
      [
        {
          id: "m2",
          type: "call",
          callId: "c1",
          action: "end",
          publicSignKey: "bob",
          timestamp: 2000,
          text: "",
        },
        {
          id: "m1",
          type: "call",
          callId: "c1",
          action: "offer",
          publicSignKey: "bob",
          timestamp: 1000,
          text: "",
        },
      ],
      2000,
    ).text,
    "📞 Voice call",
  );

  assertEquals(extractLatestPreview([], 500), {
    text: "",
    timestamp: 0,
    authorPublicSignKey: "",
    updatedAt: 500,
    empty: true,
  });
});

Deno.test("formatConversationPreviewLine prefixes self with You and group senders by name", () => {
  const participants = [
    { publicSignKey: "me", name: "Alice" },
    { publicSignKey: "bob", name: "Bob" },
  ];
  const groupParticipants = [
    ...participants,
    { publicSignKey: "carol", name: "Carol" },
  ];

  const myPreview: ConversationPreview = {
    text: "On my way",
    timestamp: 1000,
    authorPublicSignKey: "me",
    updatedAt: 1000,
  };
  assertEquals(
    formatConversationPreviewLine({
      preview: myPreview,
      selfPublicSignKey: "me",
      participants,
    }),
    "You: On my way",
  );

  const bobPreview: ConversationPreview = {
    text: "See you soon",
    timestamp: 2000,
    authorPublicSignKey: "bob",
    updatedAt: 2000,
  };
  assertEquals(
    formatConversationPreviewLine({
      preview: bobPreview,
      selfPublicSignKey: "me",
      participants,
    }),
    "See you soon",
  );
  assertEquals(
    formatConversationPreviewLine({
      preview: bobPreview,
      selfPublicSignKey: "me",
      participants: groupParticipants,
    }),
    "Bob: See you soon",
  );
});

Deno.test("activeTypingNamesForConversation suppresses author once their newer message arrives", () => {
  const typing = [{ publicSignKey: "bob", name: "Bob", updatedAt: 10_000 }];
  const olderPreview: ConversationPreview = {
    text: "Earlier",
    timestamp: 9_000,
    authorPublicSignKey: "bob",
    updatedAt: 9_000,
  };
  const newerPreview: ConversationPreview = {
    text: "Just sent!",
    timestamp: 10_500,
    authorPublicSignKey: "bob",
    updatedAt: 10_500,
  };

  assertEquals(
    activeTypingNamesForConversation(typing, olderPreview, 12_000),
    ["Bob"],
  );
  assertEquals(
    activeTypingNamesForConversation(typing, newerPreview, 12_000),
    [],
  );
  assertEquals(
    activeTypingNamesForConversation(typing, olderPreview, 10_000 + typingTtl),
    [],
  );
});

Deno.test("formatConversationTypingLabel formats 1-on-1 vs group typing labels", () => {
  assertEquals(formatConversationTypingLabel([], false), null);
  assertEquals(formatConversationTypingLabel(["Bob"], false), "typing…");
  assertEquals(formatConversationTypingLabel(["Bob"], true), "Bob is typing…");
  assertEquals(
    formatConversationTypingLabel(["Bob", "Carol"], true),
    "Bob, Carol are typing…",
  );
  assertEquals(
    formatConversationTypingLabel(["Bob", "Carol", "Dan"], true),
    "Bob, Carol and others are typing…",
  );
});

Deno.test("formatConversationTime formats today, yesterday, and older dates", () => {
  const now = new Date(2026, 10, 21, 15, 30, 0).getTime();
  const todayEarlier = new Date(2026, 10, 21, 9, 15, 0).getTime();
  const yesterday = new Date(2026, 10, 20, 18, 0, 0).getTime();
  const lastYear = new Date(2025, 4, 10, 12, 0, 0).getTime();

  assertEquals(formatConversationTime(undefined, now), "");
  assertEquals(formatConversationTime(0, now), "");
  assertEquals(formatConversationTime(yesterday, now), "Yesterday");
  assertEquals(formatConversationTime(todayEarlier, now).includes("15"), true);
  assertEquals(formatConversationTime(lastYear, now).includes("2025"), true);
});

Deno.test("makeSubscribeAllTypingStates tracks multiple conversations, excludes self, and expires after TTL", () => {
  const time = new FakeTime();
  try {
    const snapshots: ConversationTypingMap[] = [];
    const holder: {
      cb?: (result: {
        data?: {
          typingStates?: Array<{
            updatedAt?: number;
            owner?: { publicSignKey?: string; name?: string };
            conversation?: { id?: string };
          }>;
        };
      }) => void;
    } = {};

    const unsub = makeSubscribeAllTypingStates((_creds, _q, cb) => {
      holder.cb = cb;
      return () => {};
    })("selfKey", (map) => snapshots.push(map));

    holder.cb?.({
      data: {
        typingStates: [
          {
            updatedAt: Date.now(),
            owner: { publicSignKey: "bobKey", name: "Bob" },
            conversation: { id: "conv1" },
          },
          {
            updatedAt: Date.now(),
            owner: { publicSignKey: "selfKey", name: "Me" },
            conversation: { id: "conv1" },
          },
          {
            updatedAt: Date.now(),
            owner: { publicSignKey: "carolKey", name: "Carol" },
            conversation: { id: "conv2" },
          },
        ],
      },
    });

    assertEquals(Object.keys(snapshots.at(-1) ?? {}).sort(), [
      "conv1",
      "conv2",
    ]);
    assertEquals(snapshots.at(-1)?.conv1.map((p) => p.name), ["Bob"]);
    assertEquals(snapshots.at(-1)?.conv2.map((p) => p.name), ["Carol"]);

    const countBefore = snapshots.length;
    time.tick(5_000);
    assertEquals(snapshots.length, countBefore);

    time.tick(typingTtl);
    assertEquals(snapshots.at(-1), {});
    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("makeCreateConversationPreviewsManager decrypts latest messages, caches by updatedAt, and refreshes on updates", async () => {
  const alice = await makeTestIdentity();
  const bob = await makeTestIdentity();
  const symKey = await generateSymmetricKey();
  const encryptedKey: EncryptedConversationKey = await encryptAsymmetric(
    alice.publicEncryptKey,
    symKey,
  );
  const msg1 = await makeEncryptedDbMessage({
    id: "m1",
    conversationId: "conv1",
    symKey,
    sender: bob.credentials,
    message: { type: "text", text: "Hello Alice!" },
    timestamp: 1000,
  });
  const msg2 = await makeEncryptedDbMessage({
    id: "m2",
    conversationId: "conv1",
    symKey,
    sender: bob.credentials,
    message: { type: "text", text: "Are you there?" },
    timestamp: 2000,
  });

  const fetchedFor: string[] = [];
  const state: {
    latestMessages: Array<{
      id: string;
      payload: EncryptedMessage;
      timestamp: number;
    }>;
    keyCb?: (result: {
      data?: {
        keys?: Array<{
          key?: EncryptedConversationKey;
          conversation?: { id?: string };
        }>;
      };
    }) => void;
    emitted: ConversationPreviewMap[];
  } = {
    latestMessages: [msg1],
    emitted: [],
  };

  const manager = makeCreateConversationPreviewsManager({
    subscribeKeys: (_creds, _q, cb) => {
      state.keyCb = cb;
      return () => {};
    },
    fetchLatestMessages: (_creds, convId) => {
      fetchedFor.push(convId);
      return {
        promise: Promise.resolve([...state.latestMessages]),
        cancel: () => {},
      };
    },
    keyStore: createMemoryPushKeyStore(),
    readCache: () => ({}),
    writeCache: () => {},
  })(alice.credentials, (map) => state.emitted.push(map));

  const conv = {
    id: "conv1",
    title: "Bob",
    participants: [
      { publicSignKey: alice.credentials.publicSignKey, name: "Alice" },
      { publicSignKey: bob.credentials.publicSignKey, name: "Bob" },
    ],
    updatedAt: 1000,
  };

  manager.setConversations([conv]);
  await new Promise((r) => setTimeout(r, 20));
  state.keyCb?.({
    data: { keys: [{ key: encryptedKey, conversation: { id: "conv1" } }] },
  });
  await new Promise((r) => setTimeout(r, 50));

  assertEquals(state.emitted.at(-1)?.conv1, {
    text: "Hello Alice!",
    timestamp: 1000,
    authorPublicSignKey: bob.credentials.publicSignKey,
    updatedAt: 1000,
  });
  assertEquals(fetchedFor.length, 1);

  // Calling setConversations with same updatedAt does NOT re-fetch
  manager.setConversations([conv]);
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(fetchedFor.length, 1);

  // New message advances updatedAt -> triggers single refetch & updates preview
  state.latestMessages = [msg2, msg1];
  manager.setConversations([{ ...conv, updatedAt: 2000 }]);
  await new Promise((r) => setTimeout(r, 50));

  assertEquals(state.emitted.at(-1)?.conv1, {
    text: "Are you there?",
    timestamp: 2000,
    authorPublicSignKey: bob.credentials.publicSignKey,
    updatedAt: 2000,
  });
  assertEquals(fetchedFor.length, 2);

  // Live message notification updates preview immediately without extra fetch
  notifyConversationMessages(
    "conv1",
    [{
      id: "m3",
      type: "text",
      text: "Just sent live",
      publicSignKey: alice.credentials.publicSignKey,
      timestamp: 3000,
    }],
    3000,
  );
  assertEquals(state.emitted.at(-1)?.conv1, {
    text: "Just sent live",
    timestamp: 3000,
    authorPublicSignKey: alice.credentials.publicSignKey,
    updatedAt: 3000,
  });
  assertEquals(fetchedFor.length, 2);

  manager.unsubscribe();
});
