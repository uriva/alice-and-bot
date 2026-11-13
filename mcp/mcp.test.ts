import { assertEquals } from "@std/assert";
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
