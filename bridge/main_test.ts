import { Buffer } from "node:buffer";
import { assert, assertEquals } from "@std/assert";
import { MediaStreamTrack, RTCPeerConnection } from "werift";
import {
  handleRequest,
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

Deno.test(
  "pre-buffered greeting audio sent before WebRTC peer connects is held until transport connects and not dropped",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    const server = Deno.serve({ port: 0, onListen: () => {} }, handleRequest);
    const port = server.addr.port;
    const callerPc = new RTCPeerConnection();
    const callerTrack = new MediaStreamTrack({ kind: "audio" });
    const transceiver = callerPc.addTransceiver(callerTrack, {
      direction: "sendrecv",
    });
    const receivedRtpCount = { count: 0 };
    transceiver.onTrack.subscribe((remoteTrack) => {
      remoteTrack.onReceiveRtp.subscribe(() => {
        receivedRtpCount.count++;
      });
    });

    const offer = await callerPc.createOffer();
    await callerPc.setLocalDescription(offer);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/webrtc-bridge`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const answerPromise = new Promise<string>((resolve) => {
      ws.addEventListener("message", (evt) => {
        const msg = JSON.parse(String(evt.data));
        if (msg.type === "answer") resolve(msg.sdp.sdp || msg.sdp);
      });
    });

    ws.send(
      JSON.stringify({ type: "offer", sdp: { type: "offer", sdp: offer.sdp } }),
    );

    const samples24k = new Int16Array(2400);
    samples24k.fill(4000);
    ws.send(
      JSON.stringify({
        type: "audio",
        chunks: [{
          mimeType: "audio/pcm;rate=24000",
          dataBase64: Buffer.from(samples24k.buffer).toString("base64"),
        }],
      }),
    );

    const answerSdp = await answerPromise;
    await new Promise((r) => setTimeout(r, 180));

    await callerPc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    await new Promise((r) => setTimeout(r, 350));

    assert(
      receivedRtpCount.count >= 4,
      `Expected caller to receive >= 4 buffered greeting RTP frames after WebRTC connects, got ${receivedRtpCount.count}`,
    );

    ws.close();
    await callerPc.close();
    await server.shutdown();
  },
);
