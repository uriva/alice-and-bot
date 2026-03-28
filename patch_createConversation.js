const fs = require("fs");
let code = fs.readFileSync("protocol/src/clientApi.ts", "utf8");

code = code.replace(
  /export const createConversation = \(\n  db: \(\) => InstantAdminDatabase<typeof schema>,\n\)\ =>\nasync \(\n  publicSignKeys: string\[\],\n  conversationTitle: string,\n\) => \{/,
  `export const createConversation = (
  db: () => InstantAdminDatabase<typeof schema>,
) =>
async (
  publicSignKeys: string[],
  conversationTitle: string,
  credentials: Credentials,
) => {`,
);

code = code.replace(
  /\(publicSignKeyToEncryptedSymmetricKey\) =>\n      apiClient\(\{\n        endpoint: "createConversation",\n        payload: \{\n          publicSignKeyToEncryptedSymmetricKey,\n          title: conversationTitle,\n        \},\n      \}\),/g,
  `async (publicSignKeyToEncryptedSymmetricKey) =>
      apiClient({
        endpoint: "createConversation",
        payload: await buildSignedRequest(credentials, "createConversation", {
          publicSignKeyToEncryptedSymmetricKey,
          title: conversationTitle,
        }),
      }),`,
);

fs.writeFileSync("protocol/src/clientApi.ts", code);
