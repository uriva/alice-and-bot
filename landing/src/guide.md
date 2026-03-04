# Build a ChatGPT-style bot UI in 5 minutes

Most chat SDKs make you choose: either you get a polished UI with zero
flexibility, or you get raw APIs and build everything yourself.

Alice&Bot gives you a `Chat` component that handles encryption, real-time sync,
message rendering, file attachments, audio recording, and location sharing out
of the box. You just plug in credentials and a conversation ID. The entire UI is
customizable through a single `customColors` prop.

Here's what it looks like with a dark, bubble-less layout:

![ChatGPT-style chat UI built with Alice&Bot](chatgpt-example.png)

Code blocks render with syntax highlighting. Location attachments show
interactive map cards. Images, audio, and video all work. Progress bars and
spinners show up inline when your bot is doing long-running work.

## The setup

Three steps: create an identity, resolve the bot you're talking to, get or
create a conversation.

```tsx
import {
  aliasToPublicSignKey,
  Chat,
  createConversation,
  createIdentity,
  type Credentials,
  getConversations,
} from "@alice-and-bot/core";
import { useEffect, useState } from "preact/hooks";
```

### 1. Create credentials

`createIdentity` generates a public/private keypair. In production, call it once
and store the result in your database. On return visits, load from your DB
instead.

```tsx
const useCredentials = (userName: string): Credentials | null => {
  const [creds, setCreds] = useState<Credentials | null>(null);
  useEffect(() => {
    createIdentity(userName).then(setCreds);
  }, [userName]);
  return creds;
};
```

### 2. Resolve the bot

Look up a bot by its alias. This is a one-time call, so do it at module level.

```tsx
const botKeyPromise = aliasToPublicSignKey("your_bot_alias");
```

### 3. Get or create a conversation

Find an existing conversation between the user and the bot, or create a new one
if none exists.

```tsx
const useConversation = (
  credentials: Credentials | null,
  botKey: string | null,
): string | null => {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!credentials || !botKey) return;
    const participants = [credentials.publicSignKey, botKey];
    getConversations(participants).then((convos) => {
      if (Array.isArray(convos) && convos.length > 0) {
        setId(convos[0].id);
        return;
      }
      createConversation(participants, "my-chat").then((result) => {
        if ("conversationId" in result) setId(result.conversationId);
      });
    });
  }, [credentials?.publicSignKey, botKey]);
  return id;
};
```

## Render the chat

Now wire it all together. The `customColors` prop controls everything visual.

```tsx
const App = () => {
  const credentials = useCredentials("user@example.com");
  const [botKey, setBotKey] = useState<string | null>(null);
  const conversationId = useConversation(credentials, botKey);

  useEffect(() => {
    botKeyPromise.then((r) => {
      if ("publicSignKey" in r) setBotKey(r.publicSignKey);
    });
  }, []);

  if (!credentials || !botKey || !conversationId) return <p>Loading...</p>;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Chat
        conversationId={conversationId}
        credentials={credentials}
        darkModeOverride
        customColors={{
          background: "#1a1a1a",
          text: "#ccc",
          primary: "#311d2b",
          inputBackground: "transparent",
          hideTitle: true,
          hideOwnAvatar: true,
          hideOtherBubble: true,
          hideNames: true,
          inputMaxWidth: "700px",
          chatMaxWidth: "900px",
        }}
      />
    </div>
  );
};
```

That's it. No message state management, no socket handling, no encryption logic.
The `Chat` component handles all of it.

## What customColors controls

| Option            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `background`      | Chat container background color               |
| `text`            | Message text color                            |
| `primary`         | Accent color for send button, links, controls |
| `inputBackground` | Text input field background                   |
| `hideTitle`       | Remove the header bar                         |
| `hideOwnAvatar`   | Hide avatar circle next to your messages      |
| `hideOtherBubble` | Remove bubble background from bot messages    |
| `hideNames`       | Hide author name labels                       |
| `chatMaxWidth`    | Center messages in a narrow column            |
| `inputMaxWidth`   | Center the input bar in a narrow column       |

Set `hideOtherBubble`, `hideNames`, and `hideOwnAvatar` to `true` for the clean
ChatGPT look. Use `chatMaxWidth` and `inputMaxWidth` to keep content centered
and readable on wide screens.

## What you get for free

The `Chat` component includes all of this without any extra setup:

Markdown rendering with syntax-highlighted code blocks. Image, audio, and video
attachments with encrypted upload/download. Paste-to-attach for images from
clipboard. Voice message recording with waveform visualization. Location sharing
with map preview cards. Real-time typing indicators. Inline progress bars and
spinners for long-running bot tasks. Notification sounds when your bot finishes
working (if the tab is in the background). Optimistic message rendering so sent
messages appear instantly. Auto-scroll that stays pinned to the bottom as new
messages arrive.

All of it is end-to-end encrypted.

## Next steps

Check out the [GitHub repo](https://github.com/uriva/alice-and-bot) for the full
API reference, or jump into the [Discord](https://discord.gg/xkGMFH9RAz) if you
have questions.
