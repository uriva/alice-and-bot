import { assertEquals } from "@std/assert";
import type { ConversationPreview } from "./conversation-previews.ts";
import {
  computeConversationUnread,
  findUnreadDividerInfo,
  formatDocumentTitle,
  formatUnreadBadgeLabel,
  latestKnownConversationTimestamp,
  markConversationRead,
  markConversationUnread,
  parseStoredUnreadState,
  seedUnreadState,
  summarizeUnreadCounts,
} from "./unread-state.ts";

const alice = "alice_key";
const bob = "bob_key";
const carol = "carol_key";

Deno.test("seedUnreadState avoids false-positive unreads for existing conversations and uses server updatedAt", () => {
  const seeded = seedUnreadState(
    null,
    alice,
    [
      { id: "c1", updatedAt: 1_000 },
      { id: "c2", updatedAt: 2_000 },
      { id: "c3" },
    ],
    5_000,
  );

  assertEquals(seeded, {
    publicSignKey: alice,
    initializedAt: 5_000,
    lastReadAt: { c1: 1_000, c2: 2_000, c3: 5_000 },
    markedUnread: {},
  });

  // Subsequent call preserves existing state unchanged
  assertEquals(
    seedUnreadState(seeded, alice, [{ id: "c4", updatedAt: 9_000 }], 9_500),
    seeded,
  );
});

Deno.test("computeConversationUnread counts incoming messages from others after lastReadAt and ignores own messages", () => {
  const state = seedUnreadState(
    null,
    alice,
    [{ id: "c1", updatedAt: 1_000 }],
    5_000,
  );
  const preview: ConversationPreview = {
    text: "Third message",
    timestamp: 1_300,
    authorPublicSignKey: bob,
    updatedAt: 1_300,
    recentMessages: [
      { id: "m3", timestamp: 1_300, authorPublicSignKey: bob },
      { id: "m2", timestamp: 1_200, authorPublicSignKey: carol },
      { id: "m1", timestamp: 1_100, authorPublicSignKey: bob },
      { id: "m0", timestamp: 1_000, authorPublicSignKey: bob },
    ],
    oldestFetchedTimestamp: 1_000,
    fetchedFullPage: false,
  };

  // Even though client initializedAt is 5_000, server-clock messages > 1_000 are unread
  assertEquals(
    computeConversationUnread({
      conversationId: "c1",
      preview,
      selfPublicSignKey: alice,
      state,
      isActivelyViewing: false,
    }),
    {
      isUnread: true,
      count: 3,
      overflow: false,
      markedUnread: false,
      effectiveReadAt: 1_000,
    },
  );

  // Actively viewing the conversation clears unread count
  assertEquals(
    computeConversationUnread({
      conversationId: "c1",
      preview,
      selfPublicSignKey: alice,
      state,
      isActivelyViewing: true,
    }),
    {
      isUnread: false,
      count: 0,
      overflow: false,
      markedUnread: false,
      effectiveReadAt: 1_000,
    },
  );
});

Deno.test("own message sent from another device advances effective read watermark like WhatsApp", () => {
  const state = seedUnreadState(
    null,
    alice,
    [{ id: "c1", updatedAt: 1_000 }],
    2_000,
  );
  const preview: ConversationPreview = {
    text: "After your reply",
    timestamp: 1_500,
    authorPublicSignKey: bob,
    updatedAt: 1_500,
    recentMessages: [
      { id: "m4", timestamp: 1_500, authorPublicSignKey: bob },
      { id: "m3", timestamp: 1_400, authorPublicSignKey: alice },
      { id: "m2", timestamp: 1_200, authorPublicSignKey: bob },
      { id: "m1", timestamp: 1_100, authorPublicSignKey: bob },
    ],
    oldestFetchedTimestamp: 1_100,
    fetchedFullPage: false,
  };

  assertEquals(
    computeConversationUnread({
      conversationId: "c1",
      preview,
      selfPublicSignKey: alice,
      state,
      isActivelyViewing: false,
    }),
    {
      isUnread: true,
      count: 1,
      overflow: false,
      markedUnread: false,
      effectiveReadAt: 1_400,
    },
  );

  // If latest message is from self, unread count is 0
  const selfLatest: ConversationPreview = {
    text: "Got it!",
    timestamp: 1_600,
    authorPublicSignKey: alice,
    updatedAt: 1_600,
    recentMessages: [
      { id: "m5", timestamp: 1_600, authorPublicSignKey: alice },
      { id: "m4", timestamp: 1_500, authorPublicSignKey: bob },
    ],
  };

  assertEquals(
    computeConversationUnread({
      conversationId: "c1",
      preview: selfLatest,
      selfPublicSignKey: alice,
      state,
      isActivelyViewing: false,
    }),
    {
      isUnread: false,
      count: 0,
      overflow: false,
      markedUnread: false,
      effectiveReadAt: 1_600,
    },
  );
});

Deno.test("brand-new conversation created after initializedAt shows unread", () => {
  const state = seedUnreadState(null, alice, [], 1_000);
  const preview: ConversationPreview = {
    text: "Hey there!",
    timestamp: 2_000,
    authorPublicSignKey: bob,
    updatedAt: 2_000,
    recentMessages: [{ id: "m1", timestamp: 2_000, authorPublicSignKey: bob }],
  };

  assertEquals(
    computeConversationUnread({
      conversationId: "new-conv",
      preview,
      selfPublicSignKey: alice,
      state,
      isActivelyViewing: false,
    }),
    {
      isUnread: true,
      count: 1,
      overflow: false,
      markedUnread: false,
      effectiveReadAt: 1_000,
    },
  );
});

Deno.test("manual markConversationUnread shows dot (count 0) and markConversationRead clears both dot and count", () => {
  const initial = seedUnreadState(
    null,
    alice,
    [{ id: "c1", updatedAt: 1_000 }],
    2_000,
  );
  const preview: ConversationPreview = {
    text: "Already read",
    timestamp: 1_000,
    authorPublicSignKey: bob,
    updatedAt: 1_000,
    recentMessages: [{ id: "m1", timestamp: 1_000, authorPublicSignKey: bob }],
  };

  const marked = markConversationUnread(initial, "c1");
  assertEquals(
    computeConversationUnread({
      conversationId: "c1",
      preview,
      selfPublicSignKey: alice,
      state: marked,
      isActivelyViewing: false,
    }),
    {
      isUnread: true,
      count: 0,
      overflow: false,
      markedUnread: true,
      effectiveReadAt: 1_000,
    },
  );
  // Manual mark unread still shows dot even if conversation is selected in desktop pane
  assertEquals(
    computeConversationUnread({
      conversationId: "c1",
      preview,
      selfPublicSignKey: alice,
      state: marked,
      isActivelyViewing: true,
    }).isUnread,
    true,
  );

  // Opening / marking read clears manual dot and advances lastReadAt
  const cleared = markConversationRead(marked, "c1", 1_000);
  assertEquals(
    computeConversationUnread({
      conversationId: "c1",
      preview,
      selfPublicSignKey: alice,
      state: cleared,
      isActivelyViewing: false,
    }),
    {
      isUnread: false,
      count: 0,
      overflow: false,
      markedUnread: false,
      effectiveReadAt: 1_000,
    },
  );
});

Deno.test("overflow flag triggers when full fetched page is newer than lastReadAt", () => {
  const state = seedUnreadState(
    null,
    alice,
    [{ id: "c1", updatedAt: 1_000 }],
    2_000,
  );
  const preview: ConversationPreview = {
    text: "Latest",
    timestamp: 5_000,
    authorPublicSignKey: bob,
    updatedAt: 5_000,
    recentMessages: Array.from({ length: 25 }, (_, i) => ({
      id: `m-${i}`,
      timestamp: 5_000 - i * 10,
      authorPublicSignKey: bob,
    })),
    oldestFetchedTimestamp: 4_760,
    fetchedFullPage: true,
  };

  const status = computeConversationUnread({
    conversationId: "c1",
    preview,
    selfPublicSignKey: alice,
    state,
    isActivelyViewing: false,
  });

  assertEquals(status.count, 25);
  assertEquals(status.overflow, true);
  assertEquals(formatUnreadBadgeLabel(status.count, status.overflow), "25+");
  assertEquals(formatUnreadBadgeLabel(0, false), "");
  assertEquals(formatUnreadBadgeLabel(120, false), "99+");
});

Deno.test("summarizeUnreadCounts separates active and archived unread chats like WhatsApp", () => {
  const convs = [
    { id: "active-3", archived: false },
    { id: "active-dot", archived: false },
    { id: "active-read", archived: false },
    { id: "archived-2", archived: true },
  ];
  const statuses: Record<string, ReturnType<typeof computeConversationUnread>> =
    {
      "active-3": {
        isUnread: true,
        count: 3,
        overflow: false,
        markedUnread: false,
        effectiveReadAt: 100,
      },
      "active-dot": {
        isUnread: true,
        count: 0,
        overflow: false,
        markedUnread: true,
        effectiveReadAt: 100,
      },
      "active-read": {
        isUnread: false,
        count: 0,
        overflow: false,
        markedUnread: false,
        effectiveReadAt: 100,
      },
      "archived-2": {
        isUnread: true,
        count: 2,
        overflow: false,
        markedUnread: false,
        effectiveReadAt: 100,
      },
    };

  assertEquals(
    summarizeUnreadCounts(
      convs,
      (c) => statuses[c.id],
      (c) => c.archived,
    ),
    {
      activeUnreadChats: 2,
      activeUnreadMessages: 4,
      archivedUnreadChats: 1,
    },
  );
  assertEquals(
    formatDocumentTitle("Messenger - Alice&Bot", 2),
    "(2) Messenger - Alice&Bot",
  );
  assertEquals(
    formatDocumentTitle("Messenger - Alice&Bot", 0),
    "Messenger - Alice&Bot",
  );
});

Deno.test("parseStoredUnreadState validates shape and isolates identities", () => {
  const valid = JSON.stringify({
    publicSignKey: alice,
    initializedAt: 1_000,
    lastReadAt: { c1: 2_000, bad: "nope" },
    markedUnread: { c2: true, c3: false },
  });

  assertEquals(parseStoredUnreadState(valid, alice), {
    publicSignKey: alice,
    initializedAt: 1_000,
    lastReadAt: { c1: 2_000 },
    markedUnread: { c2: true },
  });
  assertEquals(parseStoredUnreadState(valid, bob), null);
  assertEquals(parseStoredUnreadState("not-json", alice), null);
  assertEquals(
    latestKnownConversationTimestamp(
      { updatedAt: 1_000 },
      {
        text: "hi",
        timestamp: 2_000,
        authorPublicSignKey: bob,
        updatedAt: 1_500,
      },
    ),
    2_000,
  );
});

Deno.test("findUnreadDividerInfo locates first unread message from others and ignores own messages", () => {
  const msgs = [
    { id: "m1", authorId: bob, timestamp: 1_000 },
    { id: "m2", authorId: alice, timestamp: 1_200 },
    { id: "m3", authorId: bob, timestamp: 1_500 },
    { id: "m4", authorId: carol, timestamp: 1_700 },
  ];
  assertEquals(findUnreadDividerInfo(msgs, alice, undefined), null);
  assertEquals(findUnreadDividerInfo(msgs, alice, 1_700), null);
  assertEquals(findUnreadDividerInfo(msgs, alice, 1_100), {
    firstUnreadMessageId: "m3",
    count: 2,
  });
});
