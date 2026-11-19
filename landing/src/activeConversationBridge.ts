type ActiveConversationGetter = () => string | null;

const state: {
  getter: ActiveConversationGetter | null;
  installed: boolean;
} = {
  getter: null,
  installed: false,
};

export const setActiveConversationGetter = (
  getter: ActiveConversationGetter | null,
) => {
  state.getter = getter;
};

const isActiveConversationQuery = (data: unknown): boolean =>
  typeof data === "object" &&
  data !== null &&
  "type" in data &&
  data.type === "alice:query-active-conversation";

type ActiveConversationQueryEvent = {
  data: unknown;
  ports?: readonly { postMessage: (message: unknown) => void }[];
};

export const handleActiveConversationQuery = (
  event: ActiveConversationQueryEvent,
  visibilityState = globalThis.document?.visibilityState,
) => {
  if (!isActiveConversationQuery(event.data)) return;
  const conversationId = visibilityState === "hidden"
    ? null
    : state.getter?.() ?? null;
  event.ports?.[0]?.postMessage({ conversationId });
};

export const installActiveConversationResponder = () => {
  if (state.installed || !globalThis.navigator?.serviceWorker) return;
  state.installed = true;
  globalThis.navigator.serviceWorker.addEventListener(
    "message",
    (event: MessageEvent) => handleActiveConversationQuery(event),
  );
};
