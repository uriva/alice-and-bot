import { assertEquals, assertExists } from "@std/assert";
import {
  type Credentials,
  handleWebhookUpdate,
  type InternalMessage,
  msgToStr,
  type WebhookUpdate,
} from "./clientApi.ts";
import {
  encryptAsymmetric,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "./crypto.ts";

Deno.test("handleWebhookUpdate decrypts message directly when conversationKey is provided in WebhookUpdate", async () => {
  const senderSign = await generateKeyPair("sign");
  const receiverSign = await generateKeyPair("sign");
  const receiverEncrypt = await generateKeyPair("encrypt");

  const receiverCredentials: Credentials = {
    publicSignKey: receiverSign.publicKey,
    privateSignKey: receiverSign.privateKey,
    privateEncryptKey: receiverEncrypt.privateKey,
  };

  const symmetricKey = await generateSymmetricKey();
  const encryptedConversationKey = await encryptAsymmetric(
    receiverEncrypt.publicKey,
    symmetricKey,
  );

  const message: InternalMessage = {
    type: "text",
    text: "hello webhook without network call",
  };
  const encryptedMessage = await encryptSymmetric(symmetricKey, {
    payload: message,
    publicSignKey: senderSign.publicKey,
    signature: await sign(senderSign.privateKey, msgToStr(message)),
  });

  const whUpdate: WebhookUpdate = {
    conversationId: "conv-test-123",
    messageId: "msg-test-123",
    timestamp: 1234567890,
    payload: encryptedMessage,
    conversationKey: encryptedConversationKey,
  };

  const res = await handleWebhookUpdate(whUpdate, receiverCredentials);
  assertExists(res);
  assertEquals(res.conversationId, "conv-test-123");
  assertEquals(res.messageId, "msg-test-123");
  assertEquals(res.message.text, "hello webhook without network call");
  assertEquals(res.conversationKey, symmetricKey);
});
