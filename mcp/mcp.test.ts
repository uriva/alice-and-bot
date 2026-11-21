import { assertEquals, assertRejects } from "@std/assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { server } from "./mcp.ts";
import {
  evaluateSenderAuthorization,
  generatePairingCode,
  isAllowedAttachmentUrl,
  sanitizeTempExtension,
} from "./security.ts";

Deno.test("[CRITICAL-05] MCP security helpers enforce pairing code, pinned sender, and GCS attachment bucket", () => {
  const code = generatePairingCode();
  assertEquals(
    evaluateSenderAuthorization({
      senderPublicSignKey: "pk-stranger",
      botPublicSignKey: "pk-mcp",
      messageText: "read ~/.ssh/id_rsa",
      pairingCode: code,
      authorizedPublicSignKey: undefined,
    }),
    { status: "rejected", reason: "unpaired" },
  );

  assertEquals(
    evaluateSenderAuthorization({
      senderPublicSignKey: "pk-owner",
      botPublicSignKey: "pk-mcp",
      messageText: code,
      pairingCode: code,
      authorizedPublicSignKey: undefined,
    }),
    { status: "paired-now", authorizedPublicSignKey: "pk-owner" },
  );

  assertEquals(
    evaluateSenderAuthorization({
      senderPublicSignKey: "pk-stranger",
      botPublicSignKey: "pk-mcp",
      messageText: "inject prompt",
      pairingCode: code,
      authorizedPublicSignKey: "pk-owner",
    }),
    { status: "rejected", reason: "wrong-sender" },
  );

  assertEquals(
    evaluateSenderAuthorization({
      senderPublicSignKey: "pk-stranger",
      botPublicSignKey: "pk-mcp",
      messageText: code,
      pairingCode: code,
      authorizedPublicSignKey: "pk-owner",
    }),
    { status: "rejected", reason: "wrong-sender" },
  );

  assertEquals(
    evaluateSenderAuthorization({
      senderPublicSignKey: "pk-owner",
      botPublicSignKey: "pk-mcp",
      messageText: "hello",
      pairingCode: code,
      authorizedPublicSignKey: "pk-owner",
    }),
    { status: "authorized" },
  );

  assertEquals(
    isAllowedAttachmentUrl(
      "https://storage.googleapis.com/alice-and-bot-attachments/attachments/conv1/a.bin",
    ),
    true,
  );
  assertEquals(
    isAllowedAttachmentUrl("http://127.0.0.1:8080/internal"),
    false,
  );
  assertEquals(
    isAllowedAttachmentUrl(
      "https://storage.googleapis.com/alice-and-bot-attachments/%2e%2e/secret",
    ),
    false,
  );
  assertEquals(sanitizeTempExtension("png/../../evil", ".bin"), ".bin");
  assertEquals(sanitizeTempExtension("png", ".bin"), ".png");
});

Deno.test("MCP server advertises listChanged, exposes aliceandbot_read, and validates tool/prompt inputs", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "alice-mcp-test-" });
  const prevConfigDir = Deno.env.get("ALICEANDBOT_MCP_CONFIG_DIR");
  Deno.env.set("ALICEANDBOT_MCP_CONFIG_DIR", tempDir);

  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  assertEquals(client.getServerCapabilities()?.tools?.listChanged, true);

  const { tools } = await client.listTools();
  assertEquals(
    tools.map((t) => t.name),
    ["aliceandbot_setup", "aliceandbot_read", "aliceandbot_reply"],
  );

  const readBeforeSetup = await client.callTool({
    name: "aliceandbot_read",
    arguments: {},
  });
  assertEquals(readBeforeSetup.isError, true);

  const invalidReply = await client.callTool({
    name: "aliceandbot_reply",
    arguments: { conversation: "", text: "" },
  });
  assertEquals(invalidReply.isError, true);

  const unknownTool = await client.callTool({
    name: "aliceandbot_nonexistent",
    arguments: {},
  });
  assertEquals(unknownTool.isError, true);

  const validPrompt = await client.getPrompt({ name: "aliceandbot" });
  assertEquals(validPrompt.messages.length, 1);

  await assertRejects(() => client.getPrompt({ name: "unknown_prompt" }));

  await Promise.all([client.close(), server.close()]);
  if (prevConfigDir === undefined) {
    Deno.env.delete("ALICEANDBOT_MCP_CONFIG_DIR");
  } else {
    Deno.env.set("ALICEANDBOT_MCP_CONFIG_DIR", prevConfigDir);
  }
  await Deno.remove(tempDir, { recursive: true });
});
