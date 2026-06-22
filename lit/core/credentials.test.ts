import { assertEquals } from "@std/assert";
import {
  base64UrlToBase64,
  getCredentialsToCopy,
  importIdentity,
  parseTransferFragment,
} from "./credentials.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

const dummyCredentials = {
  publicSignKey: "pub-key-123",
  privateSignKey: "priv-key-456",
} as unknown as Credentials;

Deno.test("base64UrlToBase64 - correctly converts base64url characters to base64 and adds padding", () => {
  assertEquals(base64UrlToBase64("abc-_123"), "abc+/123");
  assertEquals(base64UrlToBase64("ab"), "ab==");
});

Deno.test("parseTransferFragment - returns parsed details for a valid transfer hash", () => {
  const result = parseTransferFragment("#transfer=relay-123:aes-key-abc");
  assertEquals(result, { relayId: "relay-123", aesKey: "aes+key+abc=" });
});

Deno.test("parseTransferFragment - returns null for an invalid transfer hash", () => {
  assertEquals(parseTransferFragment("#not-a-transfer"), null);
});

Deno.test("importIdentity - parses valid JSON credentials", async () => {
  const creds = {
    privateSignKey: "sign-key",
    privateEncryptKey: "encrypt-key",
    publicSignKey: "pub-key",
  };
  const result = await importIdentity(JSON.stringify(creds));
  assertEquals(result, creds as unknown as Credentials);
});

Deno.test("importIdentity - returns null for invalid input", async () => {
  assertEquals(await importIdentity("not-json"), null);
  assertEquals(await importIdentity('{"only":"some"}'), null);
});

Deno.test("getCredentialsToCopy - returns stored credentials if present in localStorage", () => {
  localStorage.setItem("alicebot_credentials", '{"stored":true}');
  const result = getCredentialsToCopy("alicebot_credentials", dummyCredentials);
  assertEquals(result, '{"stored":true}');
  localStorage.removeItem("alicebot_credentials");
});

Deno.test("getCredentialsToCopy - returns stringified in-memory credentials if localStorage is empty", () => {
  localStorage.removeItem("alicebot_credentials");
  const result = getCredentialsToCopy("alicebot_credentials", dummyCredentials);
  assertEquals(result, JSON.stringify(dummyCredentials));
});

Deno.test("getCredentialsToCopy - returns null if both are empty", () => {
  localStorage.removeItem("alicebot_credentials");
  const result = getCredentialsToCopy("alicebot_credentials", null);
  assertEquals(result, null);
});
