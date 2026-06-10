import { assertEquals } from "@std/assert";
import { getCredentialsToCopy } from "./credentials.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

const dummyCredentials = {
  publicSignKey: "pub-key-123",
  privateSignKey: "priv-key-456",
} as unknown as Credentials;

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
