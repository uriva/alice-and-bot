import type { Page, WebSocketRoute } from "@playwright/test";
import type { TestData } from "./test-data.ts";
import { randomUUID } from "node:crypto";

type Triple = [string, string, unknown, number];

const attrIds: Record<string, string> = {};
const identIds: Record<string, string> = {};

const aid = (key: string) => (attrIds[key] ??= randomUUID());
const iid = (key: string) => (identIds[key] ??= randomUUID());

const blobAttr = (
  etype: string,
  label: string,
  extra: Record<string, unknown> = {},
) => ({
  id: aid(`${etype}.${label}`),
  "value-type": "blob",
  cardinality: "one",
  "forward-identity": [iid(`fwd-${etype}.${label}`), etype, label],
  "reverse-identity": null,
  "unique?": false,
  "index?": false,
  "primary?": false,
  "required?": false,
  "inferred-types": null,
  catalog: "user",
  "checked-data-type": null,
  "on-delete": null,
  "on-delete-reverse": null,
  ...extra,
});

const idAttr = (etype: string) => ({
  ...blobAttr(etype, "id", {
    "unique?": true,
    "index?": true,
    "primary?": true,
    catalog: "system",
    "reverse-identity": [iid(`rev-${etype}.id`), etype, "_id"],
  }),
});

const refAttr = (
  fwdEtype: string,
  fwdLabel: string,
  revEtype: string,
  revLabel: string,
  cardinality: "one" | "many" = "many",
) => ({
  id: aid(`${fwdEtype}->${fwdLabel}`),
  "value-type": "ref",
  cardinality,
  "forward-identity": [iid(`fwd-${fwdEtype}->${fwdLabel}`), fwdEtype, fwdLabel],
  "reverse-identity": [iid(`rev-${revEtype}->${revLabel}`), revEtype, revLabel],
  "unique?": false,
  "index?": false,
  "primary?": false,
  "required?": false,
  "inferred-types": null,
  catalog: "user",
  "checked-data-type": null,
  "on-delete": null,
  "on-delete-reverse": null,
});

const buildAttrs = () => [
  idAttr("messages"),
  blobAttr("messages", "payload"),
  blobAttr("messages", "timestamp"),

  idAttr("identities"),
  blobAttr("identities", "publicSignKey", { "unique?": true, "index?": true }),
  blobAttr("identities", "publicEncryptKey", {
    "unique?": true,
    "index?": true,
  }),
  blobAttr("identities", "name"),
  blobAttr("identities", "avatar"),
  blobAttr("identities", "alias", { "unique?": true, "index?": true }),
  blobAttr("identities", "instantEmail", { "unique?": true, "index?": true }),
  blobAttr("identities", "lastActiveAt"),
  blobAttr("identities", "priceTag"),
  blobAttr("identities", "webhook"),

  idAttr("conversations"),
  blobAttr("conversations", "title"),
  blobAttr("conversations", "updatedAt"),

  idAttr("keys"),
  blobAttr("keys", "key"),

  idAttr("typingStates"),
  blobAttr("typingStates", "updatedAt"),

  idAttr("uiElements"),
  blobAttr("uiElements", "elementId", { "unique?": true, "index?": true }),
  blobAttr("uiElements", "type"),
  blobAttr("uiElements", "text"),
  blobAttr("uiElements", "active"),
  blobAttr("uiElements", "percentage"),
  blobAttr("uiElements", "authorId"),
  blobAttr("uiElements", "updatedAt"),

  refAttr("messages", "conversation", "conversations", "messages"),
  refAttr("conversations", "keys", "keys", "conversation"),
  refAttr("identities", "keys", "keys", "owner"),
  refAttr("conversations", "participants", "identities", "conversations"),
  refAttr("identities", "archivedConversations", "conversations", "archivedBy"),
  refAttr("identities", "pinnedConversations", "conversations", "pinnedBy"),
  refAttr("conversations", "typingStates", "typingStates", "conversation"),
  refAttr("identities", "typingStates", "typingStates", "owner"),
  refAttr("conversations", "uiElements", "uiElements", "conversation"),
];

const idTriple = (
  eid: string,
  etype: string,
  tx: number,
): Triple => [eid, aid(`${etype}.id`), eid, tx];

const fieldTriples = (
  eid: string,
  etype: string,
  fields: Record<string, unknown>,
  tx: number,
): Triple[] => [
  idTriple(eid, etype, tx),
  ...Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([f, v]): Triple => [eid, aid(`${etype}.${f}`), v, tx]),
];

const link = (
  fwdEtype: string,
  fwdLabel: string,
  fwdEntityId: string,
  targetEntityId: string,
  tx: number,
): Triple => [fwdEntityId, aid(`${fwdEtype}->${fwdLabel}`), targetEntityId, tx];

const wrapResult = (ns: string, triples: Triple[]) => [{
  data: {
    "datalog-result": { "join-rows": triples.length ? [triples] : [] },
    "page-info": {
      [ns]: {
        "start-cursor": null,
        "end-cursor": null,
        "has-next-page?": false,
        "has-previous-page?": false,
      },
    },
    aggregate: null,
  },
  "child-nodes": [],
}];

const emptyResult = (ns: string) => wrapResult(ns, []);

const messageSnapshotResult = (
  conversationId: string,
  messages: TestData["messages"],
  tx: number,
) =>
  wrapResult(
    "messages",
    messages.flatMap((message) => [
      ...fieldTriples(message.id, "messages", {
        payload: message.payload,
        timestamp: message.timestamp,
      }, tx),
      link("messages", "conversation", message.id, conversationId, tx),
    ]),
  );

const queryResponse = (q: unknown, txId: number, result: unknown) =>
  JSON.stringify({ op: "add-query-ok", q, "processed-tx-id": txId, result });

const detectNs = (q: Record<string, unknown>): string | null =>
  Object.keys(q)[0] ?? null;

export type WsMock = {
  pushNewMessage: (
    msg: {
      id: string;
      payload: string;
      timestamp: number;
      senderPublicSignKey: string;
    },
  ) => void;
  pushMessageSnapshot: (messages: TestData["messages"]) => void;
  pushConversationKeySnapshot: () => void;
  pushTypingSnapshot: (updatedAt: number) => void;
};

export type ExtraConversation = {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
  extraParticipants?: { id: string; publicSignKey: string; name: string }[];
};

export const setupInstantWsMock = async (
  page: Page,
  data: TestData,
  extraConversations: readonly ExtraConversation[] = [],
): Promise<WsMock> => {
  const messageQueries: Array<{ q: unknown }> = [];
  const keyQueries: Array<{ q: unknown }> = [];
  const typingQueries: Array<{ q: unknown }> = [];
  const identityQueries: Array<{ q: unknown }> = [];
  const state: {
    serverWs: WebSocketRoute | null;
    txCounter: number;
    currentMessages: TestData["messages"];
    latestTypingUpdatedAt: number | null;
    conversationUpdatedAt: number;
    pinnedConversationIds: Set<string>;
    archivedConversationIds: Set<string>;
  } = {
    serverWs: null,
    txCounter: 100,
    currentMessages: [...data.messages],
    latestTypingUpdatedAt: null,
    conversationUpdatedAt: data.messages.reduce(
      (max, m) => Math.max(max, m.timestamp),
      Date.now(),
    ),
    pinnedConversationIds: new Set(
      extraConversations.filter((c) => c.pinned).map((c) => c.id),
    ),
    archivedConversationIds: new Set(),
  };

  const buildIdentityTriples = (tx: number): Triple[] => [
    ...fieldTriples(data.aliceIdentityId, "identities", {
      publicSignKey: data.alice.publicSignKey,
      publicEncryptKey: data.alice.publicEncryptKey,
      name: "Alice",
    }, tx),
    ...fieldTriples(data.bobIdentityId, "identities", {
      publicSignKey: data.bob.publicSignKey,
      publicEncryptKey: data.bob.publicEncryptKey,
      name: "Bob",
    }, tx),
    ...fieldTriples(data.conversationId, "conversations", {
      title: "Test Conversation",
      updatedAt: state.conversationUpdatedAt,
    }, tx),
    link(
      "conversations",
      "participants",
      data.conversationId,
      data.aliceIdentityId,
      tx,
    ),
    link(
      "conversations",
      "participants",
      data.conversationId,
      data.bobIdentityId,
      tx,
    ),
    ...fieldTriples(data.keyId, "keys", {
      key: data.aliceEncryptedKey,
    }, tx),
    link(
      "conversations",
      "keys",
      data.conversationId,
      data.keyId,
      tx,
    ),
    link("identities", "keys", data.aliceIdentityId, data.keyId, tx),
    ...extraConversations.flatMap((conv): Triple[] => {
      const convKeyId = `key-${conv.id}`;
      return [
        ...fieldTriples(conv.id, "conversations", {
          title: conv.title,
          updatedAt: conv.updatedAt,
        }, tx),
        link(
          "conversations",
          "participants",
          conv.id,
          data.aliceIdentityId,
          tx,
        ),
        link("conversations", "participants", conv.id, data.bobIdentityId, tx),
        ...(conv.extraParticipants ?? []).flatMap((p) => [
          ...fieldTriples(p.id, "identities", {
            publicSignKey: p.publicSignKey,
            name: p.name,
          }, tx),
          link("conversations", "participants", conv.id, p.id, tx),
        ]),
        ...fieldTriples(convKeyId, "keys", { key: data.aliceEncryptedKey }, tx),
        link("conversations", "keys", conv.id, convKeyId, tx),
        link("identities", "keys", data.aliceIdentityId, convKeyId, tx),
      ];
    }),
    ...Array.from(state.pinnedConversationIds).map((convId) =>
      link(
        "identities",
        "pinnedConversations",
        data.aliceIdentityId,
        convId,
        tx,
      )
    ),
    ...Array.from(state.archivedConversationIds).map((convId) =>
      link(
        "identities",
        "archivedConversations",
        data.aliceIdentityId,
        convId,
        tx,
      )
    ),
  ];

  const buildTypingTriples = (updatedAt: number, tx: number): Triple[] => {
    const typingStateId = randomUUID();
    return [
      ...fieldTriples(typingStateId, "typingStates", { updatedAt }, tx),
      idTriple(data.conversationId, "conversations", tx),
      link(
        "conversations",
        "typingStates",
        data.conversationId,
        typingStateId,
        tx,
      ),
      link(
        "conversations",
        "participants",
        data.conversationId,
        data.aliceIdentityId,
        tx,
      ),
      link(
        "conversations",
        "participants",
        data.conversationId,
        data.bobIdentityId,
        tx,
      ),
      link(
        "identities",
        "typingStates",
        data.bobIdentityId,
        typingStateId,
        tx,
      ),
      ...fieldTriples(data.aliceIdentityId, "identities", {
        publicSignKey: data.alice.publicSignKey,
        publicEncryptKey: data.alice.publicEncryptKey,
        name: "Alice",
      }, tx),
      ...fieldTriples(data.bobIdentityId, "identities", {
        publicSignKey: data.bob.publicSignKey,
        publicEncryptKey: data.bob.publicEncryptKey,
        name: "Bob",
      }, tx),
    ];
  };

  await page.routeWebSocket(
    /wss:\/\/db\.aliceandbot\.com\/runtime\/session/,
    (ws: WebSocketRoute) => {
      state.serverWs = ws;
      const tx = Date.now();

      ws.onMessage((raw) => {
        const msg = JSON.parse(String(raw));

        if (msg.op === "init") {
          messageQueries.length = 0;
          keyQueries.length = 0;
          typingQueries.length = 0;
          identityQueries.length = 0;
          ws.send(JSON.stringify({
            op: "init-ok",
            "session-id": randomUUID(),
            attrs: buildAttrs(),
          }));
          return;
        }

        if (msg.op === "add-query") {
          const ns = detectNs(msg.q);
          const tid = ++state.txCounter;
          if (ns === "keys") {
            keyQueries.push({ q: msg.q });
            const requestedConvId =
              (msg.q?.keys?.$?.where?.["conversation.id"] as
                | string
                | undefined) ?? data.conversationId;
            const matchedExtra = extraConversations.find((c) =>
              c.id === requestedConvId
            );
            const targetConvId = matchedExtra
              ? matchedExtra.id
              : data.conversationId;
            const targetKeyId = matchedExtra
              ? `key-${matchedExtra.id}`
              : data.keyId;
            const triples: Triple[] = [
              ...fieldTriples(targetKeyId, "keys", {
                key: data.aliceEncryptedKey,
              }, tx),
              idTriple(targetConvId, "conversations", tx),
              link(
                "conversations",
                "keys",
                targetConvId,
                targetKeyId,
                tx,
              ),
              link("identities", "keys", data.aliceIdentityId, targetKeyId, tx),
              ...fieldTriples(data.aliceIdentityId, "identities", {
                publicSignKey: data.alice.publicSignKey,
                publicEncryptKey: data.alice.publicEncryptKey,
                name: "Alice",
              }, tx),
            ];
            ws.send(queryResponse(msg.q, tid, wrapResult(ns, triples)));
            return;
          }

          if (ns === "messages") {
            messageQueries.push({ q: msg.q });
            const triples: Triple[] = state.currentMessages.flatMap((m) => [
              ...fieldTriples(m.id, "messages", {
                payload: m.payload,
                timestamp: m.timestamp,
              }, tx),
              link("messages", "conversation", m.id, data.conversationId, tx),
            ]);
            ws.send(queryResponse(msg.q, tid, wrapResult(ns, triples)));
            return;
          }

          if (ns === "typingStates") {
            typingQueries.push({ q: msg.q });
            ws.send(
              queryResponse(
                msg.q,
                tid,
                state.latestTypingUpdatedAt !== null
                  ? wrapResult(
                    ns,
                    buildTypingTriples(state.latestTypingUpdatedAt, tx),
                  )
                  : emptyResult(ns),
              ),
            );
            return;
          }

          if (ns === "identities") {
            identityQueries.push({ q: msg.q });
            ws.send(
              queryResponse(
                msg.q,
                tid,
                wrapResult(ns, buildIdentityTriples(tx)),
              ),
            );
            return;
          }

          if (ns === "conversations") {
            const requestedId =
              (msg.q?.conversations?.$?.where?.id as string | undefined) ??
                data.conversationId;
            const matchedExtra = extraConversations.find((c) =>
              c.id === requestedId
            );
            const convId = matchedExtra ? matchedExtra.id : data.conversationId;
            const convTitle = matchedExtra
              ? matchedExtra.title
              : "Test Conversation";
            const convUpdatedAt = matchedExtra
              ? matchedExtra.updatedAt
              : Date.now();
            const triples: Triple[] = [
              ...fieldTriples(convId, "conversations", {
                title: convTitle,
                updatedAt: convUpdatedAt,
              }, tx),
              link(
                "conversations",
                "participants",
                convId,
                data.aliceIdentityId,
                tx,
              ),
              link(
                "conversations",
                "participants",
                convId,
                data.bobIdentityId,
                tx,
              ),
              ...fieldTriples(data.aliceIdentityId, "identities", {
                publicSignKey: data.alice.publicSignKey,
                name: "Alice",
              }, tx),
              ...fieldTriples(data.bobIdentityId, "identities", {
                publicSignKey: data.bob.publicSignKey,
                name: "Bob",
              }, tx),
              ...(matchedExtra?.extraParticipants ?? []).flatMap((p) => [
                link("conversations", "participants", convId, p.id, tx),
                ...fieldTriples(p.id, "identities", {
                  publicSignKey: p.publicSignKey,
                  name: p.name,
                }, tx),
              ]),
            ];
            ws.send(queryResponse(msg.q, tid, wrapResult(ns, triples)));
            return;
          }

          ws.send(queryResponse(msg.q, tid, emptyResult(ns ?? "unknown")));
          return;
        }

        if (msg.op === "transact") {
          const steps: unknown[] = Array.isArray(msg["tx-steps"])
            ? msg["tx-steps"]
            : [];
          const pinAttrId = aid("identities->pinnedConversations");
          const archiveAttrId = aid("identities->archivedConversations");
          const applyStep = (step: unknown): boolean => {
            if (!Array.isArray(step) || step.length < 4) return false;
            const [action, _eid, attrId, targetId] = step;
            if (typeof targetId !== "string") return false;
            if (attrId === pinAttrId) {
              if (action === "add-triple") {
                state.pinnedConversationIds.add(targetId);
                return true;
              }
              if (action === "retract-triple") {
                state.pinnedConversationIds.delete(targetId);
                return true;
              }
            }
            if (attrId === archiveAttrId) {
              if (action === "add-triple") {
                state.archivedConversationIds.add(targetId);
                return true;
              }
              if (action === "retract-triple") {
                state.archivedConversationIds.delete(targetId);
                return true;
              }
            }
            return false;
          };
          const identityChanged = steps.map(applyStep).some(Boolean);
          const tid = ++state.txCounter;
          ws.send(
            JSON.stringify({
              op: "transact-ok",
              "client-event-id": msg["client-event-id"],
              "tx-id": tid,
            }),
          );
          if (identityChanged && identityQueries.length > 0) {
            const idTriples = buildIdentityTriples(Date.now());
            identityQueries.forEach(({ q }) => {
              ws.send(
                queryResponse(
                  q,
                  ++state.txCounter,
                  wrapResult("identities", idTriples),
                ),
              );
            });
          }
          return;
        }
      });
    },
  );

  return {
    pushNewMessage: (msg) => {
      state.currentMessages = [
        ...state.currentMessages,
        { ...msg, text: "" },
      ];
      state.conversationUpdatedAt = Math.max(
        state.conversationUpdatedAt + 1,
        msg.timestamp,
      );
      const activeWs = state.serverWs;
      if (!activeWs) return;
      const tx = Date.now();
      if (messageQueries.length) {
        const triples: Triple[] = state.currentMessages.flatMap((m) => [
          ...fieldTriples(m.id, "messages", {
            payload: m.payload,
            timestamp: m.timestamp,
          }, tx),
          link("messages", "conversation", m.id, data.conversationId, tx),
        ]);
        messageQueries.forEach(({ q }) => {
          activeWs.send(
            queryResponse(
              q,
              ++state.txCounter,
              wrapResult("messages", triples),
            ),
          );
        });
      }
      if (identityQueries.length) {
        const idTriples = buildIdentityTriples(tx);
        identityQueries.forEach(({ q }) => {
          activeWs.send(
            queryResponse(
              q,
              ++state.txCounter,
              wrapResult("identities", idTriples),
            ),
          );
        });
      }
    },
    pushMessageSnapshot: (messages) => {
      state.currentMessages = [...messages];
      const activeWs = state.serverWs;
      if (!activeWs || !messageQueries.length) return;
      const tx = Date.now();
      messageQueries.forEach(({ q }) => {
        activeWs.send(
          queryResponse(
            q,
            ++state.txCounter,
            messageSnapshotResult(data.conversationId, messages, tx),
          ),
        );
      });
    },
    pushConversationKeySnapshot: () => {
      const activeWs = state.serverWs;
      if (!activeWs || !keyQueries.length) return;
      const tx = Date.now();
      const triples: Triple[] = [
        ...fieldTriples(data.keyId, "keys", {
          key: data.aliceEncryptedKey,
        }, tx),
        idTriple(data.conversationId, "conversations", tx),
        link(
          "conversations",
          "keys",
          data.conversationId,
          data.keyId,
          tx,
        ),
        link("identities", "keys", data.aliceIdentityId, data.keyId, tx),
        ...fieldTriples(data.aliceIdentityId, "identities", {
          publicSignKey: data.alice.publicSignKey,
          publicEncryptKey: data.alice.publicEncryptKey,
          name: "Alice",
        }, tx),
      ];
      keyQueries.forEach(({ q }) => {
        activeWs.send(
          queryResponse(q, ++state.txCounter, wrapResult("keys", triples)),
        );
      });
    },
    pushTypingSnapshot: (updatedAt) => {
      state.latestTypingUpdatedAt = updatedAt;
      const activeWs = state.serverWs;
      if (!activeWs || !typingQueries.length) return;
      const tx = Date.now();
      const triples = buildTypingTriples(updatedAt, tx);
      typingQueries.forEach(({ q }) => {
        activeWs.send(
          queryResponse(
            q,
            ++state.txCounter,
            wrapResult("typingStates", triples),
          ),
        );
      });
    },
  };
};
