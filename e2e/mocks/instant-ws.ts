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
};

export const setupInstantWsMock = async (
  page: Page,
  data: TestData,
): Promise<WsMock> => {
  const messageQueries: Array<{ q: unknown }> = [];
  let serverWs: WebSocketRoute | null = null;
  let txCounter = 100;

  await page.routeWebSocket(
    /wss:\/\/api\.instantdb\.com\/runtime\/session/,
    (ws: WebSocketRoute) => {
      serverWs = ws;
      const tx = Date.now();

      ws.onMessage((raw: string | ArrayBuffer) => {
        const msg = JSON.parse(String(raw));

        if (msg.op === "init") {
          ws.send(JSON.stringify({
            op: "init-ok",
            "session-id": randomUUID(),
            attrs: buildAttrs(),
          }));
          return;
        }

        if (msg.op === "add-query") {
          const ns = detectNs(msg.q);
          const tid = ++txCounter;
          if (ns === "keys") {
            const triples: Triple[] = [
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
            const triples: Triple[] = data.messages.flatMap((m) => [
              ...fieldTriples(m.id, "messages", {
                payload: m.payload,
                timestamp: m.timestamp,
              }, tx),
              link("messages", "conversation", m.id, data.conversationId, tx),
            ]);
            ws.send(queryResponse(msg.q, tid, wrapResult(ns, triples)));
            return;
          }

          if (ns === "identities") {
            const triples: Triple[] = [
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
            ws.send(queryResponse(msg.q, tid, wrapResult(ns, triples)));
            return;
          }

          if (ns === "conversations") {
            const triples: Triple[] = [
              ...fieldTriples(data.conversationId, "conversations", {
                title: "Test Conversation",
                updatedAt: Date.now(),
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
              ...fieldTriples(data.aliceIdentityId, "identities", {
                publicSignKey: data.alice.publicSignKey,
                name: "Alice",
              }, tx),
              ...fieldTriples(data.bobIdentityId, "identities", {
                publicSignKey: data.bob.publicSignKey,
                name: "Bob",
              }, tx),
            ];
            ws.send(queryResponse(msg.q, tid, wrapResult(ns, triples)));
            return;
          }

          ws.send(queryResponse(msg.q, tid, emptyResult(ns ?? "unknown")));
          return;
        }

        if (msg.op === "transact") {
          ws.send(JSON.stringify({ op: "transact-ok", "tx-id": ++txCounter }));
          return;
        }
      });
    },
  );

  return {
    pushNewMessage: (msg) => {
      if (!serverWs || !messageQueries.length) return;
      const tx = Date.now();
      const triples: Triple[] = [
        ...fieldTriples(msg.id, "messages", {
          payload: msg.payload,
          timestamp: msg.timestamp,
        }, tx),
        link("messages", "conversation", msg.id, data.conversationId, tx),
      ];
      messageQueries.forEach(({ q }) => {
        serverWs!.send(
          queryResponse(q, ++txCounter, wrapResult("messages", triples)),
        );
      });
    },
    pushMessageSnapshot: (messages) => {
      if (!serverWs || !messageQueries.length) return;
      const tx = Date.now();
      messageQueries.forEach(({ q }) => {
        serverWs!.send(
          queryResponse(
            q,
            ++txCounter,
            messageSnapshotResult(data.conversationId, messages, tx),
          ),
        );
      });
    },
  };
};
