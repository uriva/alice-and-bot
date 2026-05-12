const knownPluginCommands = new Set([
  "/sessions",
  "/switch",
  "/models",
  "/themes",
  "/help",
  "/abort",
  "/new",
  "/share",
  "/interrupt",
  "/compact",
  "/clear",
]);

const permissionAndQuestionReplies = new Set([
  "/yes",
  "/y",
  "/allow",
  "/approve",
  "/no",
  "/n",
  "/deny",
  "/reject",
  "/always",
]);

export const isKnownPluginCommand = (text: string) =>
  knownPluginCommands.has(text.toLowerCase().trim());

export const isReplyCommand = (text: string) =>
  permissionAndQuestionReplies.has(text.toLowerCase().trim());

export const shouldForwardSlashToOpencode = (text: string) =>
  text.startsWith("/") &&
  !isKnownPluginCommand(text) &&
  !isReplyCommand(text);
