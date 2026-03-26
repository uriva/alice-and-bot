# Alice&Bot opencode plugin

Chat seamlessly with your `opencode` terminal AI sessions from your phone via
Alice&Bot.

Unlike the standard MCP server which requires the agent to manually call
read/reply tools, this is a **native `opencode` plugin** that deeply hooks into
the input and output streams. Messages sent from your phone instantly inject as
user prompts, and the AI's responses are automatically forwarded back in
real-time.

## Installation from source

If you cloned this repository, you can build and install the plugin using `bun`:

```bash
cd opencode-plugin
npm install
npm run build
mkdir -p ~/.config/opencode/plugins/alice
cp dist/index.js ~/.config/opencode/plugins/alice/index.js
```

## Configuration

Register the plugin in your `~/.config/opencode/opencode.json` file:

```json
{
  "plugins": {
    "alice": "~/.config/opencode/plugins/alice/index.js"
  }
}
```

Now, run `opencode`. The plugin will automatically start a secure background
tunnel and print a QR code to your terminal. Scan the QR code with your phone to
connect and start the conversation!

## Features

- **True real-time 2-way sync:** The AI's responses appear on your phone
  automatically via `experimental.text.complete` hooks.
- **Push-to-talk:** Audio attachments from your phone are transparently
  downloaded and fed into the AI as files.
- **Invisible webhook:** Automatically maps your opencode sessions to your phone
  conversation keys without manual tool-use.
