# Migrate from Room Topics to Instant Streams

## Why

We currently use InstantDB Room Topics (`room.subscribeTopic("stream", ...)`)
for ephemeral streaming, plus a separate `uiElements` table for spinners and
progress bars, plus a `/ui-update` HTTP endpoint that bridges external bots to
Room Topics.

Instant Streams (`db.streams.createWriteStream` / `createReadStream`) replaces
all three with a single durable primitive. Benefits:

- Eliminates `/ui-update` endpoint and its server-side `@instantdb/core`
  polyfill hack
- Bots write directly to Instant Streams — no server relay
- Spinners, progress bars, and text streaming become one concept (a stream)
- Streams are durable — late-joining clients see content; Room Topics are
  fire-and-forget
- Simpler code: fewer types, fewer subscriptions, fewer server routes

## Design decisions

### Bots are unsigned users

Bots use `@instantdb/core` with `init({ appId })`, no admin token, no auth.
`$streams` permissions: `create: "true"`, `view: "true"`, `update: "true"`.

### `clientId` = element identity

Each stream's `clientId` is the unique identifier (replaces the old
`elementId`). Used for deduplication when persisting the final message to the
conversation.

### Single custom column: `authorId`

The `$streams` schema has system columns (`clientId`, `done`, `size`,
`abortReason`) plus our single custom column `authorId`. No `type` column
needed.

### Unified stream model (no type column)

Rendering is based on content, not a type field:

| Old concept  | New representation                                                                 |
| ------------ | ---------------------------------------------------------------------------------- |
| Spinner      | Stream with `done: false` and no bytes written yet                                 |
| Progress bar | Stream content parses as a number (`"0.5\n"`, `"0.75\n"`) — client takes last line |
| Text stream  | Stream with text content                                                           |

### Streams linked to conversations

Use InstantDB links: `$streams` → `conversations`. Bot creates stream, gets
`streamId` via `await stream.streamId()`, then transacts to link it and set
`authorId`.

### `@instantdb/core` on Deno still needs `DummyStorage`

The `init()` call on Deno servers still requires passing a `DummyStorage`
instance.

## API surface (from Instant Streams docs)

```ts
// Write
const stream = db.streams.createWriteStream({ clientId });
const streamId = await stream.streamId();
const writer = stream.getWriter();
await writer.write("chunk");
await writer.close();

// Read
const readStream = db.streams.createReadStream({ clientId });
// or: db.streams.createReadStream({ streamId });
const reader = readStream.getReader();
const { value, done } = await reader.read();

// Query metadata
db.useQuery({ $streams: { $: { where: { clientId: "..." } } } });
// Returns: { id, clientId, done, size, abortReason, authorId }

// Link to conversation
db.transact(db.tx.$streams[streamId].link({ conversation: conversationId }));
```

## Upgrade required

Upgrade `@instantdb/core` and `@instantdb/admin` from **0.22.174** to **1.0.3**
(or latest) in `deno.json`.

## Schema changes

In `instant.schema.ts`:

- Remove `uiElements` entity
- Add `$streams` entity with custom column `authorId` (string)
- Replace `conversationUiElements` link with `conversationStreams` link
  (`conversations` ↔ `$streams`)

In `instant.perms.ts`:

- Remove `uiElements` permissions
- Add `$streams` permissions:
  `{ allow: { create: "true", view: "true", update: "true" } }`

## Migration steps

### 1. Schema & permissions

- Update `instant.schema.ts` and `instant.perms.ts` as described above
- Upgrade instantdb packages in `deno.json`

### 2. Create SDK stream helper for bots

New file: `protocol/src/streams.ts`

Exports helpers that bots call instead of the old `uiUpdateUrl` POST:

- `createBotStream(db, conversationId, authorId)` → returns writer + streamId
- `writeBotProgress(writer, fraction)` → writes `"${fraction}\n"`
- `closeBotStream(writer)` → closes the writer

### 3. Rewrite client-side streaming (`lit/core/room.ts`)

Replace `subscribeEphemeralStreams()` (Room Topics) with:

- Query `$streams` linked to the conversation where `done: false`
- For each active stream, call `db.streams.createReadStream({ streamId })`
- Pipe content into the same callback shape the UI expects

### 4. Update `lit/components/connected-chat.ts`

- Remove `subscribeEphemeralStreams` call and `uiElements` subscription
- Replace with `$streams` query (linked to conversation)
- Feed results through `standaloneStreamEntries()` /
  `standaloneSpinnerEntries()` / `standaloneProgressEntries()` (or a unified
  replacement)

### 5. Unify types (`lit/components/types.ts`)

Replace `ActiveStream`, `ActiveSpinner`, `ActiveProgress` with a single
`ActiveStreamEntry` type. Rendering logic in `chat-box.ts` determines
presentation from content.

### 6. Update `lit/components/chat-box.ts`

Adapt rendering to handle the unified stream type. Spinner = no content yet,
progress = numeric content, text = string content.

### 7. Update React hooks (`lit/react-hooks.ts`)

Replace `useEphemeralStreams` with a new `useStreams` hook backed by `$streams`
queries and `createReadStream`.

### 8. Update public exports (`mod.ts`)

- Remove: `useEphemeralStreams`, `EphemeralStreamEvent`, `uiUpdateUrl`,
  `buildUiUpdateUrl`
- Add: new stream helpers and hooks
- This is a **breaking change** — acceptable per project guidelines

### 9. Delete dead server code

- Delete `backend/src/uiUpdate.ts`
- Delete `backend/src/instantCorePolyfill.ts`
- Remove `/ui-update` route from `backend/src/main.ts` (lines ~882-888)
- Remove `uiUpdateUrl` / `buildUiUpdateUrl` from `protocol/src/clientApi.ts`

### 10. Update e2e mocks

- `e2e/mocks/instant-ws.ts`: remove `uiElements` attrs, add `$streams` attrs

### 11. Run all tests

```sh
# From e2e/
npx playwright test widget.spec.ts
npx playwright test abstract-chat-box.spec.ts
npx playwright test chat.spec.ts

# Unit tests
deno test lit/core/subscriptions.test.ts
deno test --allow-read landing/build.test.ts
```

### 12. Update downstream: prompt2bot

prompt2bot is the **only** consumer of `/ui-update`. Files to update:

- `prompt2bot/server/src/uiUpdateRegistry.ts` — replace
  `sendAliceAndBotStreamUpdate()` with direct Instant Streams writes via new SDK
  helpers
- `prompt2bot/server/src/channelHandlers.ts` — replace `upsertUiElement()` calls
- `prompt2bot/createTaskInstructions.ts` — update remote tool instructions for
  stopping spinners

The other 4 downstream repos (`find-scene`, `lurk`, `sally`, `captain-hook`) do
not use `/ui-update` and only need a version bump.

## Files reference

| File                                 | Role                                      |
| ------------------------------------ | ----------------------------------------- |
| `deno.json`                          | instantdb package versions                |
| `instant.schema.ts`                  | schema: `$streams` entity + link          |
| `instant.perms.ts`                   | permissions for `$streams`                |
| `protocol/src/streams.ts`            | NEW — bot SDK helpers                     |
| `protocol/src/clientApi.ts`          | remove `uiUpdateUrl` / `buildUiUpdateUrl` |
| `lit/core/room.ts`                   | rewrite: Room Topics → Instant Streams    |
| `lit/components/connected-chat.ts`   | rewrite: unified stream subscription      |
| `lit/components/types.ts`            | simplify: unified stream type             |
| `lit/components/chat-box.ts`         | adapt rendering                           |
| `lit/react-hooks.ts`                 | rewrite: `useStreams` hook                |
| `mod.ts`                             | update public exports                     |
| `backend/src/uiUpdate.ts`            | DELETE                                    |
| `backend/src/instantCorePolyfill.ts` | DELETE                                    |
| `backend/src/main.ts`                | remove `/ui-update` route                 |
| `e2e/mocks/instant-ws.ts`            | update mock attrs                         |
