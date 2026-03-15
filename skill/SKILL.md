---
name: alice-and-bot
description: Build chat bots and integrate messaging into apps using the Alice&Bot platform. Use when the user wants to create a chat bot, send/receive encrypted messages, set up webhooks for incoming messages, manage identities, or build on the Alice&Bot messenger. Triggers on "alice and bot", "aliceandbot", "chat bot on alice", "send a message via alice", or any task involving the Alice&Bot messaging API.
---

# Alice&Bot — Encrypted Messaging for Bots and Humans

Alice&Bot is a developer-first, end-to-end encrypted chat platform. Bots are
first-class citizens — create identities, send/receive messages, show typing
indicators and progress bars, all via a TypeScript API.

Package: `@alice-and-bot/core` on [JSR](https://jsr.io/@alice-and-bot/core)

## Install

```bash
# Deno
deno add jsr:@alice-and-bot/core

# npm
npx jsr add @alice-and-bot/core
```

## Quick start — echo bot

```typescript
import {
  createIdentity,
  handleWebhookUpdate,
  sendMessageWithKey,
  setAlias,
  setWebhook,
} from "@alice-and-bot/core";

// 1. Create an identity (once — persist the credentials)
const credentials = await createIdentity("Echo Bot");
await setAlias({ alias: "echo-bot", credentials });

// 2. Register your webhook
await setWebhook({ url: "https://my-bot.example.com/webhook", credentials });

// 3. Handle incoming messages
const handleIncoming = async (webhookBody) => {
  const { conversationId, message, conversationKey } =
    await handleWebhookUpdate(webhookBody, credentials);

  if (message.type !== "text") return;

  // 4. Reply using the cached conversation key (faster)
  await sendMessageWithKey({
    conversationKey,
    conversation: conversationId,
    credentials,
    message: { type: "text", text: `You said: ${message.text}` },
  });
};
```

Users can chat with the bot at
`https://aliceandbot.com/chat?chatWith=<publicSignKey>` or by searching for its
alias in the app.

## Core concepts

**Identity** — A public/private key pair. No passwords, no tokens. Identity =
possession of private keys. Create as many as you want.

**Credentials** — `{ publicSignKey, privateSignKey, privateEncryptKey }`
(RSA-2048 keys, base64-encoded DER). Persist these — they ARE the identity.

**Encryption** — Hybrid E2E: AES-256-GCM symmetric key per conversation,
encrypted per-participant with RSA-OAEP. The server never sees plaintext.

**Webhook** — The server POSTs a `WebhookUpdate` to your URL when a message
arrives. You decrypt it with `handleWebhookUpdate`.

## API reference

### Identity

#### `createIdentity(name, alias?)`

Create a new identity. Returns `Credentials`.

```typescript
const credentials = await createIdentity("My Bot", "my-bot");
// { publicSignKey: "...", privateSignKey: "...", privateEncryptKey: "..." }
```

#### `setAlias({ alias, credentials })`

Set a human-readable alias (unique handle).

```typescript
await setAlias({ alias: "my-bot", credentials });
// { success: true } or { success: false, error: "alias-taken" | "invalid-alias" | ... }
```

#### `setName({ name, credentials })`

Update the display name.

```typescript
await setName({ name: "My Awesome Bot", credentials });
```

#### `setWebhook({ url, credentials })`

Register a webhook URL for incoming messages.

```typescript
await setWebhook({ url: "https://my-bot.example.com/webhook", credentials });
```

### Messaging

#### `sendMessage({ credentials, conversation, message })`

Send a message. Automatically fetches the conversation key.

```typescript
await sendMessage({
  credentials,
  conversation: conversationId,
  message: { type: "text", text: "Hello!" },
});
```

#### `sendMessageWithKey({ conversationKey, conversation, credentials, message })`

Send a message with a cached conversation key (faster — skips a round trip).

```typescript
await sendMessageWithKey({
  conversationKey, // from handleWebhookUpdate
  conversation: conversationId,
  credentials,
  message: { type: "text", text: "Quick reply" },
});
```

#### `handleWebhookUpdate(webhookBody, credentials)`

Decrypt an incoming webhook payload.

```typescript
const { conversationId, message, conversationKey, messageId } =
  await handleWebhookUpdate(webhookBody, credentials);
// message.type is "text" | "edit" | "spinner" | "progress" | "call"
// message.text contains the message text
// message.publicSignKey identifies the sender
// conversationKey can be reused with sendMessageWithKey
```

#### Message types

```typescript
// Text message
{ type: "text", text: "Hello", attachments?: Attachment[] }

// Edit a previous message
{ type: "edit", editOf: messageId, text: "Corrected text", attachments?: Attachment[] }

// Show a spinner in the chat (for processing indicators)
{ type: "spinner", text: "Thinking...", active: true, elementId: "unique-id" }

// Show a progress bar
{ type: "progress", text: "Uploading...", percentage: 50, elementId: "unique-id" }
```

Maximum text length: 10,000 characters.

### Conversations

#### `createConversation(publicSignKeys, title)`

Create a conversation between participants.

```typescript
import { createConversation } from "@alice-and-bot/core";
const result = await createConversation(
  [botCredentials.publicSignKey, userPublicSignKey],
  "Support Chat",
);
// { conversationId: "..." } or { error: "..." }
```

#### `getConversations(publicSignKeys)`

Find conversations involving these participants.

```typescript
import { getConversations } from "@alice-and-bot/core";
const conversations = await getConversations([credentials.publicSignKey]);
// [{ id, title, participants: [{ publicSignKey }] }]
```

#### `getConversationInfo(conversationId)`

Get conversation metadata and participant profiles.

```typescript
import { getConversationInfo } from "@alice-and-bot/core";
const info = await getConversationInfo(conversationId);
// { conversationInfo: { participants: [{ publicSignKey, name?, avatar?, alias? }], isPartial } }
```

### Profiles

#### `getProfile(publicSignKey)`

Look up a user's profile.

```typescript
import { getProfile } from "@alice-and-bot/core";
const profile = await getProfile(publicSignKey);
// { name?, avatar?, alias? } or null
```

#### `aliasToPublicSignKey(alias)`

Resolve an alias to a public sign key.

```typescript
import { aliasToPublicSignKey } from "@alice-and-bot/core";
const result = await aliasToPublicSignKey("some-user");
// { publicSignKey: "..." } or { error: "no-such-alias" }
```

#### `publicSignKeyToAlias(publicSignKey)`

Reverse lookup — key to alias.

```typescript
import { publicSignKeyToAlias } from "@alice-and-bot/core";
const result = await publicSignKeyToAlias(key);
// { alias: "..." } or { error: "no-such-identity" | "no-alias" }
```

### Typing indicators

#### `sendTyping({ conversation, isTyping, publicSignKey })`

Show/hide the typing indicator.

```typescript
import { sendTyping } from "@alice-and-bot/core";
await sendTyping({
  conversation: conversationId,
  isTyping: true,
  publicSignKey: credentials.publicSignKey,
});
```

### Files and attachments

#### `uploadAttachment({ credentials, conversationId, conversationKey, file })`

Encrypt and upload a file. Returns an `Attachment` to include in a message.

```typescript
import { uploadAttachment } from "@alice-and-bot/core";
const attachment = await uploadAttachment({
  credentials,
  conversationId,
  conversationKey,
  file: myFile, // File object
});
if ("error" in attachment) throw new Error(attachment.error);

await sendMessageWithKey({
  conversationKey,
  conversation: conversationId,
  credentials,
  message: { type: "text", text: "Here's the file", attachments: [attachment] },
});
```

File size limits: images 10MB, audio 25MB, video 100MB, other files 25MB.

#### `downloadAttachment({ url, conversationKey })`

Decrypt and download an attachment.

```typescript
import { downloadAttachment } from "@alice-and-bot/core";
const arrayBuffer = await downloadAttachment({
  url: attachment.url,
  conversationKey,
});
```

### Live UI updates (spinners & progress bars)

Bots can show spinners and progress bars in the chat without sending actual
messages, via the UI update endpoint.

```typescript
import { buildUiUpdateUrl } from "@alice-and-bot/core";

const elementId = crypto.randomUUID();
const url = buildUiUpdateUrl(elementId);

// Show a spinner
await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "spinner",
    text: "Processing...",
    active: true,
  }),
});

// Update to progress bar
await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "progress",
    text: "Uploading...",
    percentage: 75,
  }),
});

// Clear the spinner
await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "spinner", text: "", active: false }),
});
```

### Utility

#### `chatWithMeLink(publicSignKey)`

Generate a link that opens a chat with this identity.

```typescript
import { chatWithMeLink } from "@alice-and-bot/core";
const link = chatWithMeLink(credentials.publicSignKey);
// "https://aliceandbot.com/chat?chatWith=..."
```

## Common patterns

### Persist credentials

Credentials ARE the identity. If you lose them, the identity is gone. Store them
securely (env vars, secret manager, encrypted file).

```typescript
import { createIdentity } from "@alice-and-bot/core";

// First run — create and persist
const credentials = await createIdentity("My Bot");
await Deno.writeTextFile("credentials.json", JSON.stringify(credentials));

// Subsequent runs — load from file
const credentials = JSON.parse(await Deno.readTextFile("credentials.json"));
```

### Bot with webhook (Deno server)

```typescript
import {
  type Credentials,
  handleWebhookUpdate,
  sendMessageWithKey,
  setWebhook,
  type WebhookUpdate,
} from "@alice-and-bot/core";

const credentials: Credentials = JSON.parse(
  Deno.env.get("BOT_CREDENTIALS")!,
);

await setWebhook({ url: "https://my-bot.deno.dev/webhook", credentials });

Deno.serve(async (req) => {
  if (new URL(req.url).pathname !== "/webhook") {
    return new Response("Not found", { status: 404 });
  }
  const body: WebhookUpdate = await req.json();
  const { conversationId, message, conversationKey } =
    await handleWebhookUpdate(body, credentials);

  if (message.type === "text") {
    await sendMessageWithKey({
      conversationKey,
      conversation: conversationId,
      credentials,
      message: { type: "text", text: `Echo: ${message.text}` },
    });
  }
  return new Response("ok");
});
```

### Show thinking indicator while processing

```typescript
import {
  buildUiUpdateUrl,
  handleWebhookUpdate,
  sendMessageWithKey,
} from "@alice-and-bot/core";

const handleMessage = async (webhookBody, credentials) => {
  const { conversationId, message, conversationKey } =
    await handleWebhookUpdate(webhookBody, credentials);

  if (message.type !== "text") return;

  const elementId = crypto.randomUUID();
  const uiUrl = buildUiUpdateUrl(elementId);

  // Show spinner
  await fetch(uiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "spinner",
      text: "Thinking...",
      active: true,
    }),
  });

  // Do work...
  const reply = await generateReply(message.text);

  // Clear spinner
  await fetch(uiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spinner", text: "", active: false }),
  });

  // Send reply
  await sendMessageWithKey({
    conversationKey,
    conversation: conversationId,
    credentials,
    message: { type: "text", text: reply },
  });
};
```

## Links

- [GitHub](https://github.com/uriva/alice-and-bot)
- [JSR Package](https://jsr.io/@alice-and-bot/core)
- [Web App](https://aliceandbot.com/chat)
- [Discord](https://discord.gg/xkGMFH9RAz)
