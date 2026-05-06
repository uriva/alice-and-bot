type ReasoningPart = {
  id: string;
  text?: string;
  time?: { end?: number };
  type?: string;
};

export const reasoningStreamUpdate = ({
  conversationId,
  part,
  publicSignKey,
}: {
  conversationId: string;
  part?: ReasoningPart;
  publicSignKey: string;
}) => {
  if (part?.type !== "reasoning" || !part.text) return;
  return {
    active: !part.time?.end,
    authorId: publicSignKey,
    conversationId,
    elementId: `opencode-reasoning-${part.id}`,
    text: part.text,
    type: "stream",
  };
};
