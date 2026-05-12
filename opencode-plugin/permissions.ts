export type PermissionReply = "once" | "always" | "reject";

export type PendingPermission = {
  requestId: string;
  sessionId: string;
  conversationId: string;
  description: string;
};

export const permissionReplyForCommand = (
  command: string,
): PermissionReply | undefined =>
  ({
    "/yes": "once",
    "/y": "once",
    "/allow": "once",
    "/approve": "once",
    "/no": "reject",
    "/n": "reject",
    "/deny": "reject",
    "/reject": "reject",
    "/always": "always",
  } as const)[command.toLowerCase().trim()];

export const findPendingPermissionForConvo = ({
  pending,
  conversationId,
  sessionId,
}: {
  pending: Iterable<PendingPermission>;
  conversationId: string;
  sessionId?: string;
}) => {
  const all = [...pending].filter((p) => p.conversationId === conversationId);
  return all.find((p) => p.sessionId === sessionId) ?? all[0];
};
