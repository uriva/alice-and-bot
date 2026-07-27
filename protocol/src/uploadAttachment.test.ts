import { assertEquals } from "@std/assert";
import { uploadAttachment } from "./clientApi.ts";
import { generateKeyPair, generateSymmetricKey } from "./crypto.ts";

const makeRealCredentials = async () => {
  const signKeys = await generateKeyPair("sign");
  const encryptKeys = await generateKeyPair("encrypt");
  return {
    publicSignKey: signKeys.publicKey,
    privateSignKey: signKeys.privateKey,
    privateEncryptKey: encryptKeys.privateKey,
  };
};

Deno.test("uploadAttachment normalizes nameless camera photos and missing mimeTypes without crashing", async () => {
  const credentials = await makeRealCredentials();
  const conversationKey = await generateSymmetricKey();

  const cameraFileWithoutNameOrType = new File(
    [new Uint8Array([1, 2, 3, 4])],
    "",
    {
      type: "",
    },
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const urlStr = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    if (urlStr.includes("getUploadUrl") || urlStr.includes("/api")) {
      return new Response(
        JSON.stringify({
          uploadUrl: "https://example.com/upload-test",
          fileUrl: "https://example.com/file-test.jpg",
          maxSize: 1000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (urlStr.includes("upload-test")) {
      return new Response("OK", { status: 200 });
    }
    return originalFetch(input, init);
  };

  try {
    const result = await uploadAttachment({
      credentials,
      conversationId: "conv-123",
      conversationKey,
      file: cameraFileWithoutNameOrType,
    });

    if ("error" in result) {
      throw new Error(
        `Expected successful attachment upload, got error: ${result.error}`,
      );
    }

    if (result.type === "image") {
      assertEquals(result.name, "image.jpg");
      assertEquals(result.mimeType, "image/jpeg");
      assertEquals(result.url, "https://example.com/file-test.jpg");
    } else {
      throw new Error(`Expected image attachment type, got ${result.type}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("uploadAttachment handles network fetch exceptions gracefully", async () => {
  const credentials = await makeRealCredentials();
  const conversationKey = await generateSymmetricKey();
  const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", {
    type: "image/jpeg",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.reject(new TypeError("Failed to fetch"));
  };

  try {
    const result = await uploadAttachment({
      credentials,
      conversationId: "conv-123",
      conversationKey,
      file,
    });

    assertEquals("error" in result, true);
    if ("error" in result) {
      assertEquals(result.error.startsWith("upload-failed:"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
