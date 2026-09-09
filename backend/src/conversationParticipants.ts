// getConversations resolves the conversation whose participant set is EXACTLY
// the requested keys (used to find "the conversation between these parties").
// The exact-set check must be immune to duplicate participant rows (InstantDB
// can return the same link more than once), so compare deduplicated sets rather
// than raw array lengths — `participants.length === keys.length` silently breaks
// when a participant is linked twice.
export const chooseOptimalParticipantKey = (
  publicSignKeys: string[],
  identities: { publicSignKey: string; alias?: string | null }[],
): string | undefined => {
  const nonAlias = identities.find(
    ({ publicSignKey, alias }) =>
      publicSignKeys.includes(publicSignKey) && !alias,
  );
  return nonAlias?.publicSignKey ?? publicSignKeys[0];
};

export const conversationHasExactParticipants =
  (publicSignKeys: string[]) =>
  (conversation: { participants: { publicSignKey: string }[] }): boolean => {
    const wanted = new Set(publicSignKeys);
    const have = new Set(
      conversation.participants.map(({ publicSignKey }) => publicSignKey),
    );
    if (wanted.size !== have.size) return false;
    for (const k of wanted) if (!have.has(k)) return false;
    return true;
  };
