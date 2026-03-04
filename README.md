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
  name: string,
  alias?: string // optional public alias to set at creation
): Promise<Credentials>
```

Handle incoming webhook updates:

```ts
handleWebhookUpdate(
  update: WebhookUpdate,
  credentials: Credentials
): Promise<{ conversationId: string; message: DecipheredMessage; conversationKey: string }>
```

Send a message to a conversation (have the library fetch/decrypt the
conversation key for you):

```ts
sendMessage({
  conversation: string,
  credentials: Credentials,
  message: { type: "text"; text: string; attachments?: Attachment[] }
}): Promise<{ messageId: string }>
```

Send a message if you already possess the decrypted `conversationKey` (e.g.
after handling a webhook update) to avoid the extra key fetch:

```ts
sendMessageWithKey({
  conversationKey: string,
  conversation: string,
  credentials: Credentials,
  message: { type: "text"; text: string; attachments?: Attachment[] }
}): Promise<{ messageId: string }>
```

### Attachments

To send a message with attachments:

1. Upload each file using `uploadAttachment` to get an `Attachment` object
2. Include the returned attachments in your `sendMessage` call

```ts
// Step 1: Upload files
const attachment = await uploadAttachment({
  credentials,
  conversationId,
  conversationKey,
  file,
});
if ("error" in attachment) throw new Error(attachment.error);

// Step 2: Send message with attachments
await sendMessage({
  credentials,
  conversation: conversationId,
  message: { type: "text", text: "Check this out!", attachments: [attachment] },
});
```

Upload a file as an encrypted attachment:

```ts
uploadAttachment({
  credentials: Credentials,
  conversationId: string,
  conversationKey: string,
  file: File,
}): Promise<Attachment | { error: string }>
```

Download and decrypt an attachment:

```ts
downloadAttachment({
  url: string,
  conversationKey: string,
}): Promise<ArrayBuffer>
```

File size limits (in bytes):

```ts
fileSizeLimits = {
  image: 10 * MB, // 10 MB
  audio: 25 * MB, // 25 MB
  video: 100 * MB, // 100 MB
  file: 25 * MB, // 25 MB (other files)
};
```

Attachment types:

```ts
type ImageAttachment = {
  type: "image";
  url: string;
  name: string;
  size: number;
  mimeType: `image/${string}`;
  width?: number;
  height?: number;
};
type AudioAttachment = {
  type: "audio";
  url: string;
  name: string;
  size: number;
  mimeType: `audio/${string}`;
  duration?: number;
};
type VideoAttachment = {
  type: "video";
  url: string;
  name: string;
  size: number;
  mimeType: `video/${string}`;
  duration?: number;
  width?: number;
  height?: number;
};
type FileAttachment = {
  type: "file";
  url: string;
  name: string;
  size: number;
  mimeType: string;
};
type Attachment =
  | ImageAttachment
  | AudioAttachment
  | VideoAttachment
  | FileAttachment;
```

Look up a public sign key by alias (public):

```ts
aliasToPublicSignKey(
  alias: string
): Promise<{ publicSignKey: string } | { error: "no-such-alias" }>
```

Look up an alias by public sign key:

```ts
publicSignKeyToAlias(publicSignKey: string): Promise<
  | { alias: string }
  | { error: "no-such-identity" | "no-alias" }
>
```

Fetch basic profile (name / avatar / alias) for an identity (null if not found):

```ts
useIdentityProfile(
  publicSignKey: string
): { name?: string; avatar?: string; alias?: string } | null
```

Non-React one-off fetch (no hook / subscription):

```ts
getProfile(
  publicSignKey: string
): Promise<{ name?: string; avatar?: string; alias?: string } | null>
```

Fetch (partial) conversation info (first 10 participant profiles + isPartial
flag):

```ts
getConversationInfo(
  conversationId: string
): Promise<
  | {
      conversationInfo: {
        participants: {
          publicSignKey: string;
          name?: string;
          avatar?: string;
          alias?: string;
        }[];
        isPartial: boolean; // true if more than 10 participants
      };
    }
  | { error: "not-found" }
>
```

Set or update an alias (signature-based auth handled internally, no session
required). Aliases: lowercase letters, numbers, underscore, max 15 chars:

```ts
setAlias({
  alias: string,
  credentials: Credentials,
}): Promise<
  | { success: true }
  | { success: false; error: "alias-taken" | "invalid-alias" | "not-found" | "invalid-auth" }
>
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

### ChatGPT-Style Design

You can make the chat look like ChatGPT or other AI assistant UIs by using
`AbstractChatBox` with `customColors`. This gives you a full-width, dark,
bubble-less layout with centered content.

```tsx
import { AbstractChatBox } from "@alice-and-bot/core";
import type { CustomColors } from "@alice-and-bot/core";

const chatGptColors: CustomColors = {
  background: "#0b1021", // dark background
  text: "#e4e4e7", // light text
  primary: "#6366f1", // accent color (send button, links)
  inputBackground: "#1a1b2e", // input field background
  hideTitle: true, // no header bar
  hideOwnAvatar: true, // no avatar next to your messages
  hideOtherBubble: true, // no bubble around bot messages
  hideNames: true, // no author names above messages
  chatMaxWidth: "768px", // center messages in a narrow column
  inputMaxWidth: "768px", // center input in a narrow column
};

const App = () => (
  <div
    style={{
      height: "100vh",
      width: "100%",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <AbstractChatBox
      userId="user-1"
      onSend={(text) => {/* handle send */}}
      messages={messages}
      limit={100}
      loadMore={() => {}}
      title=""
      darkModeOverride
      customColors={chatGptColors}
    />
  </div>
);
```

Key `CustomColors` options for this look:

| Option            | Effect                                          |
| ----------------- | ----------------------------------------------- |
| `hideTitle`       | Removes the header/title bar                    |
| `hideOwnAvatar`   | Hides avatar circle next to your messages       |
| `hideOtherBubble` | Removes the bubble background from bot messages |
| `hideNames`       | Hides author name labels above messages         |
| `chatMaxWidth`    | Centers message content in a narrow column      |
| `inputMaxWidth`   | Centers the input bar in a narrow column        |
| `inputBackground` | Custom background for the text input field      |

See `example/main.tsx` for a full working example with mock data.

### Full Integration with a Bot

The `Chat` component handles encryption, real-time sync, and message rendering.
You just need to create credentials, resolve the bot you want to talk to, and
get or create a conversation.

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

// resolve the bot's public key from its alias (once, at module level)
const botKeyPromise = aliasToPublicSignKey("your_bot_alias");

// create or load credentials for the current user.
// in production, persist these in your own DB (see below).
const useCredentials = (userName: string): Credentials | null => {
  const [creds, setCreds] = useState<Credentials | null>(null);
  useEffect(() => {
    createIdentity(userName).then(setCreds);
  }, [userName]);
  return creds;
};

// find an existing conversation or create one
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
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
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

`Chat` props:

| Prop                   | Type           | Description                           |
| ---------------------- | -------------- | ------------------------------------- |
| `credentials`          | `Credentials`  | User identity (from `createIdentity`) |
| `conversationId`       | `string`       | Conversation to display               |
| `onClose`              | `() => void`   | Optional close button callback        |
| `emptyMessage`         | `JSX.Element`  | Shown when there are no messages yet  |
| `darkModeOverride`     | `boolean`      | Force dark mode                       |
| `customColors`         | `CustomColors` | Customize look and feel (see above)   |
| `enableAttachments`    | `boolean`      | Show attachment menu (default `true`) |
| `enableAudioRecording` | `boolean`      | Show mic button (default `true`)      |

**Persisting credentials:** `createIdentity` generates a new keypair every time.
In production, call it once and store the returned `Credentials` in your
database. On subsequent visits, load them from your DB instead of calling
`createIdentity` again.

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

## Self-Hosting

To run your own alice-and-bot server:

### Prerequisites

- [Deno](https://deno.land/) installed locally
- A [Deno Deploy](https://deno.com/deploy) account (for hosting the backend)
- An [InstantDB](https://instantdb.com/) account (for the database)
- A [Google Cloud](https://cloud.google.com/) account (for file storage)

### 1. InstantDB Setup

1. Create a new app at [instantdb.com](https://instantdb.com/)
2. Copy your app ID
3. Push the schema:
   ```sh
   npx instant-cli push-schema --app <your-app-id>
   ```

### 2. Google Cloud Storage Setup

1. Create a new GCP project or use an existing one
2. Enable the Cloud Storage API
3. Create a storage bucket:
   ```sh
   gsutil mb gs://your-bucket-name
   ```
4. Create a service account with Storage Admin permissions:
   ```sh
   gcloud iam service-accounts create your-service-account \
     --display-name="Storage Service Account"

   gcloud projects add-iam-policy-binding your-project-id \
     --member="serviceAccount:your-service-account@your-project-id.iam.gserviceaccount.com" \
     --role="roles/storage.admin"
   ```
5. Generate a JSON key for the service account:
   ```sh
   gcloud iam service-accounts keys create key.json \
     --iam-account=your-service-account@your-project-id.iam.gserviceaccount.com
   ```
6. Configure CORS on the bucket to allow uploads from any origin (security is
   enforced by signed URLs):
   ```sh
   cat > cors.json << 'EOF'
   [
     {
       "origin": ["*"],
       "method": ["GET", "PUT", "POST", "OPTIONS"],
       "responseHeader": ["Content-Type", "x-goog-content-length-range"],
       "maxAgeSeconds": 3600
     }
   ]
   EOF
   gsutil cors set cors.json gs://your-bucket-name
   ```

### 3. Backend Deployment (Deno Deploy)

1. Fork or clone this repository
2. Create a new project on [Deno Deploy](https://dash.deno.com/)
3. Link your repository and set the entry point to `backend/src/main.ts`
4. Add environment variables:
   - `INSTANT_APP_ID`: Your InstantDB app ID
   - `INSTANT_ADMIN_TOKEN`: Your InstantDB admin token
   - `GCS_BUCKET`: Your GCS bucket name (e.g., `your-bucket-name`)
   - `GCP_CREDENTIALS`: The contents of your `key.json` file (paste as a single
     line or JSON string)

### 4. Frontend Setup

Update the API endpoint in your frontend to point to your Deno Deploy URL.

For the React client or landing page, update the relevant configuration to use
your backend URL.

### 5. Widget Hosting (Optional)

To host your own widget:

1. Build the widget:
   ```sh
   cd widget && deno task build
   ```
2. Upload to your GCS bucket or any static hosting:
   ```sh
   gsutil -h "Content-Type:application/javascript" \
     -h "Cache-Control:public, max-age=31536000" \
     cp widget/dist/widget.iife.js gs://your-bucket-name/widget/dist/widget.iife.js
   gsutil acl ch -u AllUsers:R gs://your-bucket-name/widget/dist/widget.iife.js
   ```

## Known security weaknesses

Beyond message encryption, all metadata is currently exposed.

TODO:

1. handle faking the time
1. handle linking message to a bad conversation id
1. handle impersonation of the notification server
1. handle message inserted to the db but endpoint not called
1. limit editing instant entities
1. handle a member of the conversation injecting a geniuine signed message from
   someone outside
1. createConversation endpoint is public
1. notify endpoint is public
1. one can choose not to notify - adding messages
1. everyone can see all metadata - groups, who sent when
1. anyone can check if two people has a conversation
1. webhooks are exposed to anyone seeing participants, so people can send
   requests at them
