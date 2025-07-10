# alice-and-bot

Chat reimagined for the age of bots.

## Installation

### Using Deno (via JSR)

```ts
import aliceAndBot from "jsr:@alice-and-bot/core";
```

### Using Node.js (via npm)

```sh
npm install @jsr/alice-and-bot__core
```

```js
import aliceAndBot from "@jsr/alice-and-bot__core";
```

## Features

1. e2e encryption
1. group chats
1. unlimited identities
1. basic UI to deploy on a react app or a script to embed in any page

Alice in bot is in its early days, API is likely to change often, but it already
works i produciton, powering build-chatbot.com and other sites.

## Community

Join our [Discord](https://discord.gg/xkGMFH9RAz) for questions, feedback, and
discussion.

## Usage

### Functions

Get or create a conversation ID between the current user and another:

```ts
useGetOrCreateConversation(
  creds: Credentials | null,
  otherSide: string
): string | null
```

List all conversations for a user:

```ts
useConversations(
  publicSignKey: string
): { id: string; title: string; participants: { publicSignKey: string }[] }[] | null
```

Create a new group conversation:

```ts
createConversation(
  publicSignKeys: string[],
  conversationTitle: string
): Promise<{ conversationId: string } | { error: string }>
```

Set a webhook for receiving updates:

```ts
setWebhook(
  url: string,
  publicSignKey: string
): Promise<{ success: boolean } | { error: string }>
```

Generate a new user identity:

```ts
createIdentity(
  name: string
): Promise<Credentials>
```

Handle incoming webhook updates:

```ts
handleWebhookUpdate(
  update: WebhookUpdate,
  credentials: Credentials
): Promise<{ conversationId: string; message: DecipheredMessage; conversationKey: string }>
```

Send a message to a conversation:

```ts
sendMessage({
  conversationKey: string,
  conversation: string,
  credentials: Credentials,
  message: { type: "text"; text: string }
}): Promise<{ messageId: string }>
```

### React component

Embed a chat UI in your React app:

```tsx
<Chat
  credentials={Credentials}
  conversationId={string}
  onClose?: () => void
/>
```

### Widget for any html page

```html
<script
  src="https://storage.googleapis.com/alice-and-bot/widget/dist/widget.iife.js"
  async
  onload="aliceAndBot.loadChatWidget({ initialMessage: 'Hi!', dialingTo: '<public sign key here>' })"
></script>
```

### Generating the embed script programmatically

You can generate the widget embed script using the exported `embedScript`
function:

```ts
embedScript({
  publicSignKey: string,
  initialMessage: string
}): string
```

Example usage:

```ts
import { embedScript } from "alice-and-bot";

const scriptTag = embedScript({
  publicSignKey: "<public sign key here>",
  initialMessage: "Hi!",
});
// Insert scriptTag into your HTML
```

## Known security weaknesses

As discussed, we are at the early days, and beyond the encryption on the
messages themselves, all metadata is exposed. Specific weaknesses we are aware
of:

1. handle faking the time
1. handle linking message to a bad conversation id
1. handle impersonation of the notification server
1. handle message being in the db but es not called
1. limit editing instant entities
1. handle a member of the conversation injecting a geniuine signed message from
   someone outside
1. createConversation endpoint is public
1. notify endpoint is public
1. one can choose not to notify - adding messages
1. everyone can see all metadata - groups, who sent when
1. webhooks are exposed to anyone seeing participants

We hope to tackle all in the coming period!
