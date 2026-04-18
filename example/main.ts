import { coerce } from "@uri/gamla";
import type {
  AbstracChatMessage,
  CustomColors,
} from "../lit/components/types.ts";
import { ChatBox } from "../lit/components/chat-box.ts";

const userId = "user-1";
const botId = "assistant-1";
const now = Date.now();
const minute = 60_000;

const makeBotMsg = (
  id: string,
  text: string,
  minutesAgo: number,
): AbstracChatMessage => ({
  id,
  authorId: botId,
  authorName: "Assistant",
  text,
  timestamp: now - minutesAgo * minute,
});

const makeUserMsg = (
  id: string,
  text: string,
  minutesAgo: number,
): AbstracChatMessage => ({
  id,
  authorId: userId,
  authorName: "You",
  text,
  timestamp: now - minutesAgo * minute,
});

const initialMessages: AbstracChatMessage[] = [
  makeUserMsg("1", "Hey, can you help me with a sorting algorithm?", 30),
  makeBotMsg(
    "2",
    "Of course! What kind of sorting are you looking for? Here are some common options:\n\n- **Bubble Sort** - Simple but O(n^2)\n- **Merge Sort** - Efficient, O(n log n), stable\n- **Quick Sort** - Fast in practice, O(n log n) average\n- **Radix Sort** - Linear time for integers",
    29,
  ),
  makeUserMsg("3", "Show me a merge sort implementation in TypeScript.", 28),
  makeBotMsg(
    "4",
    `Here's a clean merge sort implementation:\n\n\`\`\`typescript\nconst merge = (left: number[], right: number[]): number[] => {\n  const result: number[] = [];\n  let i = 0;\n  let j = 0;\n  while (i < left.length && j < right.length) {\n    if (left[i] <= right[j]) {\n      result.push(left[i++]);\n    } else {\n      result.push(right[j++]);\n    }\n  }\n  return [...result, ...left.slice(i), ...right.slice(j)];\n};\n\nconst mergeSort = (arr: number[]): number[] => {\n  if (arr.length <= 1) return arr;\n  const mid = Math.floor(arr.length / 2);\n  return merge(\n    mergeSort(arr.slice(0, mid)),\n    mergeSort(arr.slice(mid)),\n  );\n};\n\`\`\`\n\nThis runs in **O(n log n)** time and **O(n)** space.`,
    27,
  ),
  {
    ...makeUserMsg(
      "5",
      "Nice! What about the space complexity trade-offs?",
      26,
    ),
    replyTo: {
      id: "2",
      authorId: botId,
      authorName: "Assistant",
      text: "Of course! What kind of sorting are you looking for?",
    },
  },
  makeUserMsg(
    "6",
    "Also, is merge sort stable? I need to sort objects by multiple keys.",
    25,
  ),
  makeBotMsg(
    "7",
    "Great questions!\n\n**Space complexity:** Merge sort uses O(n) extra space because it creates temporary arrays during merging. In contrast, quicksort is in-place (O(log n) stack space).\n\n**Stability:** Yes, merge sort is **stable** — equal elements maintain their relative order. This makes it perfect for multi-key sorting:\n\n1. Sort by secondary key first\n2. Then sort by primary key\n\nSince the sort is stable, items with equal primary keys will retain their secondary ordering.",
    24,
  ),
  makeUserMsg("8", "Can you show me a table comparing sorting algorithms?", 20),
  makeBotMsg(
    "9",
    "Here's a comparison:\n\n| Algorithm | Best | Average | Worst | Space | Stable |\n|-----------|------|---------|-------|-------|--------|\n| Bubble Sort | O(n) | O(n^2) | O(n^2) | O(1) | Yes |\n| Merge Sort | O(n log n) | O(n log n) | O(n log n) | O(n) | Yes |\n| Quick Sort | O(n log n) | O(n log n) | O(n^2) | O(log n) | No |\n| Heap Sort | O(n log n) | O(n log n) | O(n log n) | O(1) | No |\n| Radix Sort | O(nk) | O(nk) | O(nk) | O(n+k) | Yes |\n\n> **Tip:** For most real-world use cases, the built-in `Array.sort()` in JS/TS uses TimSort (a hybrid of merge sort and insertion sort), which is both stable and efficient.",
    19,
  ),
  {
    ...makeUserMsg("10", "Thanks, this is really helpful!", 15),
    reactions: [
      { emoji: "👍", authorId: botId, authorName: "Assistant" },
      { emoji: "👍", authorId: userId, authorName: "You" },
      { emoji: "❤️", authorId: botId, authorName: "Assistant" },
    ],
  },
  makeBotMsg(
    "11",
    "You're welcome! Let me know if you need help with anything else. Here's one more useful pattern — a generic comparator-based sort:\n\n```typescript\ntype Comparator<T> = (a: T, b: T) => number;\n\nconst sortBy = <T,>(cmp: Comparator<T>) =>\n  (arr: T[]): T[] =>\n    [...arr].sort(cmp);\n\nconst byAge = sortBy<{ name: string; age: number }>(\n  (a, b) => a.age - b.age,\n);\n```\n\nThis gives you a reusable, curried sorting utility.",
    14,
  ),
  makeUserMsg("12", "By the way, I'm working from a café in Tel Aviv!", 10),
  {
    ...makeBotMsg("13", "Nice! Here's your location on the map:", 9),
    attachments: [{
      type: "location" as const,
      latitude: 32.0853,
      longitude: 34.7818,
      label: "Tel Aviv, Israel",
    }],
  },
];

const chatGptColors: CustomColors = {
  background: "#0b1021",
  text: "#e4e4e7",
  primary: "#6366f1",
  hideTitle: true,
  hideOwnAvatar: true,
  hideOtherBubble: true,
  hideNames: true,
  chatMaxWidth: "768px",
  inputMaxWidth: "768px",
  inputBackground: "#1a1b2e",
};

const loadMoreEnabled = new URLSearchParams(globalThis.location.search).has(
  "loadMore",
);

const wideCodeLine = "x".repeat(500);
const wideTextLine = "y".repeat(500);
const makeHistoryBatch = (batchIndex: number): AbstracChatMessage[] =>
  [0, 1, 2].map((i) => ({
    id: `history-${batchIndex}-${i}`,
    authorId: i % 2 === 0 ? botId : userId,
    authorName: i % 2 === 0 ? "Assistant" : "You",
    text:
      `Older message ${batchIndex}.${i} ${wideTextLine}\n\n\`\`\`\n${wideCodeLine}\n\`\`\`\n\n${wideTextLine}`,
    timestamp: now - (60 + batchIndex * 10 + i) * minute,
  }));

let messages = [...initialMessages];
let nextId = initialMessages.length + 1;
let historyBatchIndex = 0;

const messengerBg = "#0b0c10";
const messengerPanel = "#14151c";
const messengerBorder = "#22232d";
const messengerText = "#e4e4e7";
const messengerMuted = "#9ca3af";
const narrowBreakpoint = "768px";

const responsiveCss = `
.mess-root{height:100vh;width:100%;display:flex;flex-direction:row;background:${messengerBg};color:${messengerText};font-family:system-ui,-apple-system,sans-serif}
.mess-sidebar{width:280px;flex-shrink:0;border-right:1px solid ${messengerBorder};background:${messengerPanel};display:flex;flex-direction:column;min-height:0}
.mess-sidebar-header{padding:14px 16px;border-bottom:1px solid ${messengerBorder};font-weight:600;font-size:16px}
.mess-contact-list{flex:1;overflow-y:auto;min-height:0}
.mess-contact-row{padding:10px 14px;border-bottom:1px solid ${messengerBorder};cursor:pointer;display:flex;flex-direction:column;gap:2px}
.mess-contact-row.active{background:#1f2030}
.mess-contact-name{font-weight:500;font-size:14px}
.mess-contact-preview{font-size:12px;color:${messengerMuted}}
@media (max-width:${narrowBreakpoint}){.mess-sidebar{display:none}}
`;

const contactNames = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eli",
  "Farah",
  "Gita",
  "Hugo",
];

const contactRow = (name: string, active: boolean) => {
  const row = document.createElement("div");
  row.className = `mess-contact-row${active ? " active" : ""}`;
  const n = document.createElement("div");
  n.className = "mess-contact-name";
  n.textContent = name;
  const p = document.createElement("div");
  p.className = "mess-contact-preview";
  p.textContent = "Latest message preview…";
  row.append(n, p);
  return row;
};

const makeMessengerLayout = (host: HTMLElement) => {
  host.className = "mess-root";
  host.innerHTML = `
    <aside class="mess-sidebar">
      <div class="mess-sidebar-header">Chats</div>
      <div class="mess-contact-list"></div>
    </aside>
  `;
  const list = host.querySelector(".mess-contact-list")!;
  contactNames.forEach((n, i) => list.appendChild(contactRow(n, i === 0)));
  return host;
};

const plainLayout = (host: HTMLElement) => {
  host.style.cssText =
    "height:100vh;width:100%;display:flex;flex-direction:column";
  return host;
};

const styleTag = document.createElement("style");
styleTag.textContent = responsiveCss;
document.head.appendChild(styleTag);

const root = coerce(document.getElementById("root"));

const chatParent = loadMoreEnabled
  ? makeMessengerLayout(root)
  : plainLayout(root);

const chatBox = new ChatBox();
chatBox.userId = userId;
chatBox.messages = messages;
chatBox.canLoadMore = loadMoreEnabled;
chatBox.loadMore = () => {
  if (!loadMoreEnabled) return;
  historyBatchIndex++;
  messages = [...makeHistoryBatch(historyBatchIndex), ...messages];
  chatBox.messages = messages;
  if (historyBatchIndex >= 3) chatBox.canLoadMore = false;
};
chatBox.title = "ChatGPT Example";
chatBox.isDark = true;
if (!loadMoreEnabled) chatBox.customColors = chatGptColors;
chatBox.enableAttachments = true;
chatBox.enableAudioRecording = true;
chatBox.onReact = (messageId: string, emoji: string, remove?: boolean) => {
  messages = messages.map((m) =>
    m.id !== messageId ? m : {
      ...m,
      reactions: remove
        ? (m.reactions ?? []).filter((r) =>
          !(r.emoji === emoji && r.authorId === userId)
        )
        : [...(m.reactions ?? []), {
          emoji,
          authorId: userId,
          authorName: "You",
        }],
    }
  );
  chatBox.messages = messages;
};
chatBox.onSend = (text: string, replyTo?: string) => {
  const replyMsg = replyTo ? messages.find((m) => m.id === replyTo) : undefined;
  messages = [
    ...messages,
    {
      id: String(nextId++),
      authorId: userId,
      authorName: "You",
      text,
      timestamp: Date.now(),
      ...(replyMsg
        ? {
          replyTo: {
            id: replyMsg.id,
            authorId: replyMsg.authorId,
            authorName: replyMsg.authorName,
            text: replyMsg.text,
          },
        }
        : {}),
    },
  ];
  chatBox.messages = messages;
};
chatBox.onSendLocation = (
  latitude: number,
  longitude: number,
  label?: string,
) => {
  messages = [
    ...messages,
    {
      id: String(nextId++),
      authorId: userId,
      authorName: "You",
      text: "",
      timestamp: Date.now(),
      attachments: [{
        type: "location" as const,
        latitude,
        longitude,
        label,
      }],
    },
  ];
  chatBox.messages = messages;
};

chatParent.appendChild(chatBox);
