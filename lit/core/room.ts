import { accessDb } from "./instant-client.ts";

export type EphemeralStreamEvent = {
  elementId: string;
  text: string;
  active: boolean;
  authorId?: string;
  updatedAt: number;
};

const extractPayload = (event: unknown): EphemeralStreamEvent | null => {
  const e = event as Record<string, unknown>;
  const payload = (e.elementId ? e : (e.data || e)) as EphemeralStreamEvent;
  return payload?.elementId ? payload : null;
};

export const subscribeEphemeralStreams = (
  conversationId: string,
  onChange: (streams: EphemeralStreamEvent[]) => void,
) => {
  const streams = new Map<string, EphemeralStreamEvent>();
  const room = accessDb().joinRoom("conversations", conversationId);

  room.publishPresence({});

  const unsubTopic = room.subscribeTopic(
    // @ts-expect-error Instant typing is restrictive for topics when no explicit shape is provided
    "stream",
    (event: unknown) => {
      const payload = extractPayload(event);
      if (!payload) return;
      streams.set(payload.elementId, payload);
      onChange(Array.from(streams.values()));
      if (payload.active === false) {
        setTimeout(() => {
          const current = streams.get(payload.elementId);
          if (current?.active === false) {
            streams.delete(payload.elementId);
            onChange(Array.from(streams.values()));
          }
        }, 5000);
      }
    },
  );

  return () => {
    unsubTopic();
    room.leaveRoom();
  };
};
