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
import {
  defaultWebhookServerPublicKey,
  maxWebhookOriginSkewMs,
  resetSeenWebhookMessages,
  signWebhookOrigin,
  verifyWebhookOrigin,
} from "./webhookAuth.ts";

const bytesToBase64 = (buffer: ArrayBuffer): string =>
  btoa(
    Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(""),
  );

const generateEd25519KeyPair = async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  );
  if (!("publicKey" in kp)) {
    throw new Error("Expected asymmetric Ed25519 keypair");
  }
  return {
    publicKey: bytesToBase64(
      await crypto.subtle.exportKey("spki", kp.publicKey),
    ),
    privateKey: bytesToBase64(
      await crypto.subtle.exportKey("pkcs8", kp.privateKey),
    ),
  };
};

const makeReceiver = async () => {
  const receiverSign = await generateKeyPair("sign");
  const receiverEncrypt = await generateKeyPair("encrypt");
  const credentials: Credentials = {
    publicSignKey: receiverSign.publicKey,
    privateSignKey: receiverSign.privateKey,
    privateEncryptKey: receiverEncrypt.privateKey,
  };
  return { credentials, publicEncryptKey: receiverEncrypt.publicKey };
};

Deno.test("handleWebhookUpdate decrypts message directly when conversationKey is provided in WebhookUpdate", async () => {
  resetSeenWebhookMessages();
  const senderSign = await generateKeyPair("sign");
  const receiver = await makeReceiver();

  const symmetricKey = await generateSymmetricKey();
  const encryptedConversationKey = await encryptAsymmetric(
    receiver.publicEncryptKey,
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

  const res = await handleWebhookUpdate(whUpdate, receiver.credentials);
  assertExists(res);
  assertEquals(res.conversationId, "conv-test-123");
  assertEquals(res.messageId, "msg-test-123");
  assertEquals(res.message.text, "hello webhook without network call");
  assertEquals(res.conversationKey, symmetricKey);
});

Deno.test("signWebhookOrigin, verifyWebhookOrigin, and handleWebhookUpdate enforce Ed25519 server authenticity and timestamp skew", async () => {
  resetSeenWebhookMessages();
  const serverKeys = await generateEd25519KeyPair();
  const senderSign = await generateKeyPair("sign");
  const receiver = await makeReceiver();
  const symmetricKey = await generateSymmetricKey();
  const encryptedConversationKey = await encryptAsymmetric(
    receiver.publicEncryptKey,
    symmetricKey,
  );

  const now = 1_750_000_000_000;
  const message: InternalMessage = {
    type: "text",
    text: "authenticated server delivery",
  };
  const payload = await encryptSymmetric(symmetricKey, {
    payload: message,
    publicSignKey: senderSign.publicKey,
    signature: await sign(senderSign.privateKey, msgToStr(message)),
  });

  const unsignedUpdate: WebhookUpdate = {
    conversationId: "conv-signed-1",
    messageId: "msg-signed-1",
    timestamp: now,
    payload,
    conversationKey: encryptedConversationKey,
  };

  assertEquals(
    await handleWebhookUpdate(unsignedUpdate, receiver.credentials, {
      requireServerSignature: true,
      webhookServerPublicKey: serverKeys.publicKey,
      now,
    }),
    undefined,
  );

  const serverSignature = await signWebhookOrigin(serverKeys.privateKey, {
    messageId: unsignedUpdate.messageId,
    conversationId: unsignedUpdate.conversationId,
    timestamp: unsignedUpdate.timestamp,
    payload: unsignedUpdate.payload,
  });
  const signedUpdate: WebhookUpdate = { ...unsignedUpdate, serverSignature };

  assertEquals(
    await verifyWebhookOrigin(signedUpdate, {
      publicKey: serverKeys.publicKey,
      now,
    }),
    true,
  );
  assertEquals(
    await verifyWebhookOrigin(signedUpdate, {
      publicKey: defaultWebhookServerPublicKey,
      now,
    }),
    false,
  );

  const accepted = await handleWebhookUpdate(
    signedUpdate,
    receiver.credentials,
    {
      requireServerSignature: true,
      webhookServerPublicKey: serverKeys.publicKey,
      now,
      allowReplay: true,
    },
  );
  assertExists(accepted);
  assertEquals(accepted.message.text, "authenticated server delivery");

  assertEquals(
    await handleWebhookUpdate(
      { ...signedUpdate, timestamp: now + 1 },
      receiver.credentials,
      {
        webhookServerPublicKey: serverKeys.publicKey,
        now,
        allowReplay: true,
      },
    ),
    undefined,
  );
  assertEquals(
    await handleWebhookUpdate(
      { ...signedUpdate, conversationId: "conv-tampered" },
      receiver.credentials,
      {
        webhookServerPublicKey: serverKeys.publicKey,
        now,
        allowReplay: true,
      },
    ),
    undefined,
  );
  assertEquals(
    await handleWebhookUpdate(
      { ...signedUpdate, messageId: "msg-tampered" },
      receiver.credentials,
      {
        webhookServerPublicKey: serverKeys.publicKey,
        now,
        allowReplay: true,
      },
    ),
    undefined,
  );
  assertEquals(
    await handleWebhookUpdate(
      { ...signedUpdate, serverSignature: "%%%malformed-base64%%%" },
      receiver.credentials,
      {
        webhookServerPublicKey: serverKeys.publicKey,
        now,
        allowReplay: true,
      },
    ),
    undefined,
  );
  assertEquals(
    await handleWebhookUpdate(signedUpdate, receiver.credentials, {
      webhookServerPublicKey: serverKeys.publicKey,
      now: now + maxWebhookOriginSkewMs + 1,
      allowReplay: true,
    }),
    undefined,
  );
});

Deno.test("handleWebhookUpdate rejects replayed messageIds without poisoning cache on failed decryption", async () => {
  resetSeenWebhookMessages();
  const senderSign = await generateKeyPair("sign");
  const attackerSign = await generateKeyPair("sign");
  const receiver1 = await makeReceiver();
  const receiver2 = await makeReceiver();
  const symmetricKey = await generateSymmetricKey();
  const wrongSymmetricKey = await generateSymmetricKey();

  const encKey1 = await encryptAsymmetric(
    receiver1.publicEncryptKey,
    symmetricKey,
  );
  const encKey2 = await encryptAsymmetric(
    receiver2.publicEncryptKey,
    symmetricKey,
  );

  const poisonPayload: InternalMessage = {
    type: "text",
    text: "poison attempt",
  };
  const badCiphertext = await encryptSymmetric(wrongSymmetricKey, {
    payload: poisonPayload,
    publicSignKey: attackerSign.publicKey,
    signature: "bad-sig",
  });

  const poisonAttempt = await handleWebhookUpdate(
    {
      conversationId: "conv-replay-1",
      messageId: "msg-target-1",
      timestamp: Date.now(),
      payload: badCiphertext,
      conversationKey: encKey1,
    },
    receiver1.credentials,
  );
  assertEquals(poisonAttempt, undefined);

  const genuineMsg: InternalMessage = {
    type: "text",
    text: "genuine delivery",
  };
  const genuineCiphertext = await encryptSymmetric(symmetricKey, {
    payload: genuineMsg,
    publicSignKey: senderSign.publicKey,
    signature: await sign(senderSign.privateKey, msgToStr(genuineMsg)),
  });

  const firstDelivery = await handleWebhookUpdate(
    {
      conversationId: "conv-replay-1",
      messageId: "msg-target-1",
      timestamp: Date.now(),
      payload: genuineCiphertext,
      conversationKey: encKey1,
    },
    receiver1.credentials,
  );
  assertExists(firstDelivery);
  assertEquals(firstDelivery.message.text, "genuine delivery");

  const replayDelivery = await handleWebhookUpdate(
    {
      conversationId: "conv-replay-1",
      messageId: "msg-target-1",
      timestamp: Date.now(),
      payload: genuineCiphertext,
      conversationKey: encKey1,
    },
    receiver1.credentials,
  );
  assertEquals(replayDelivery, undefined);

  const explicitAllowReplay = await handleWebhookUpdate(
    {
      conversationId: "conv-replay-1",
      messageId: "msg-target-1",
      timestamp: Date.now(),
      payload: genuineCiphertext,
      conversationKey: encKey1,
    },
    receiver1.credentials,
    { allowReplay: true },
  );
  assertExists(explicitAllowReplay);

  const otherRecipientDelivery = await handleWebhookUpdate(
    {
      conversationId: "conv-replay-1",
      messageId: "msg-target-1",
      timestamp: Date.now(),
      payload: genuineCiphertext,
      conversationKey: encKey2,
    },
    receiver2.credentials,
  );
  assertExists(otherRecipientDelivery);
});
