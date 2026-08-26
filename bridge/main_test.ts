import { assert, assertEquals } from "@std/assert";
import {
  asProxyEndpoint,
  pipeProxyEndpoints,
  type ProxyEndpoint,
} from "./main.ts";

type FakeSocket = {
  endpoint: ProxyEndpoint;
  sent: string[];
  emit: (data: string) => void;
  open: () => void;
  terminate: () => void;
  closed: boolean;
  opened: boolean;
};

const makeFakeSocket = (): FakeSocket => {
  const messageHandlers: ((data: string) => void)[] = [];
  const closeHandlers: (() => void)[] = [];
  const openHandlers: (() => void)[] = [];
  const socket: FakeSocket = {
    sent: [],
    closed: false,
    opened: false,
    endpoint: {
      send: (data: string) => {
        if (socket.closed) throw new Error("send after close");
        socket.sent.push(data);
      },
      close: () => socket.terminate(),
      onMessage: (h) => messageHandlers.push(h),
      onClose: (h) => {
        if (socket.closed) h();
        else closeHandlers.push(h);
      },
      onOpen: (h) => {
        if (socket.opened) h();
        else openHandlers.push(h);
      },
    },
    emit: (data: string) => {
      for (const h of messageHandlers) h(data);
    },
    open: () => {
      if (socket.opened) return;
      socket.opened = true;
      for (const h of openHandlers) h();
    },
    terminate: () => {
      if (socket.closed) return;
      socket.closed = true;
      for (const h of closeHandlers) h();
    },
  };
  return socket;
};

Deno.test("proxy pipes messages in both directions", () => {
  const twilio = makeFakeSocket();
  const upstream = makeFakeSocket();
  pipeProxyEndpoints(twilio.endpoint, upstream.endpoint);
  twilio.open();
  upstream.open();
  twilio.emit('{"event":"start"}');
  assertEquals(upstream.sent, ['{"event":"start"}']);
  upstream.emit('{"event":"media"}');
  assertEquals(twilio.sent, ['{"event":"media"}']);
});

Deno.test("messages sent before peer opens are queued and flushed on open", () => {
  const twilio = makeFakeSocket();
  const upstream = makeFakeSocket();
  pipeProxyEndpoints(twilio.endpoint, upstream.endpoint);
  twilio.open();
  twilio.emit('{"event":"start"}');
  assertEquals(upstream.sent.length, 0, "peer not open yet");
  upstream.open();
  assertEquals(upstream.sent, ['{"event":"start"}']);
});

Deno.test("closing one side closes the other", () => {
  const a = makeFakeSocket();
  const b = makeFakeSocket();
  pipeProxyEndpoints(a.endpoint, b.endpoint);
  a.open();
  b.open();
  b.terminate();
  assert(a.closed, "peer should be closed when one side closes");
});
