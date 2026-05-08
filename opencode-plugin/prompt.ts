export const promptWasAcceptedDespiteError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("JSON Parse error: Unexpected EOF") ||
    message.includes("Unexpected end of JSON input");
};
