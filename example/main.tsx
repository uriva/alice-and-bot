import { coerce } from "@uri/gamla";
import { render } from "preact";
import { useState } from "preact/hooks";
import {
  type AbstracChatMessage,
  AbstractChatBox,
} from "../clients/react/src/abstractChatBox.tsx";
import type { CustomColors } from "../clients/react/src/design.tsx";

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
  makeUserMsg("5", "Nice! What about the space complexity trade-offs?", 26),
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
  makeUserMsg("10", "Thanks, this is really helpful!", 15),
  makeBotMsg(
    "11",
    "You're welcome! Let me know if you need help with anything else. Here's one more useful pattern — a generic comparator-based sort:\n\n```typescript\ntype Comparator<T> = (a: T, b: T) => number;\n\nconst sortBy = <T,>(cmp: Comparator<T>) =>\n  (arr: T[]): T[] =>\n    [...arr].sort(cmp);\n\nconst byAge = sortBy<{ name: string; age: number }>(\n  (a, b) => a.age - b.age,\n);\n```\n\nThis gives you a reusable, curried sorting utility.",
    14,
  ),
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

const containerStyle = {
  height: "100vh",
  width: "100%",
  display: "flex",
  flexDirection: "column",
};

const noop = () => {};

let nextId = initialMessages.length + 1;

const Example = () => {
  const [messages, setMessages] = useState(initialMessages);

  const onSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: String(nextId++),
        authorId: userId,
        authorName: "You",
        text,
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <div style={containerStyle}>
      <AbstractChatBox
        userId={userId}
        onSend={onSend}
        messages={messages}
        limit={100}
        loadMore={noop}
        title="ChatGPT Example"
        darkModeOverride
        customColors={chatGptColors}
      />
    </div>
  );
};

render(<Example />, coerce(document.getElementById("root")));
