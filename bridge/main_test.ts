import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { MediaStreamTrack, RTCPeerConnection } from "werift";
import {
  handleRequest,
  isSafeIceCandidate,
  pipeProxyEndpoints,
  type ProxyEndpoint,
  verifyTwilioStreamRequest,
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

Deno.test(
  "[CRITICAL-07] & [CRITICAL-08] bridge survives malformed JSON, missing sdp, bad inputRate, oversized frames, and blocks unauthenticated Twilio stream when TWILIO_AUTH_TOKEN is set",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    Deno.env.set("TWILIO_AUTH_TOKEN", "test-twilio-secret-token");
    const unauthTwilioRes = handleRequest(
      new Request("http://127.0.0.1:8080/twilio-voice/stream", {
        headers: { upgrade: "websocket" },
      }),
    );
    Deno.env.delete("TWILIO_AUTH_TOKEN");
    assertEquals(unauthTwilioRes.status, 403);

    const server = Deno.serve({ port: 0, onListen: () => {} }, handleRequest);
    const port = server.addr.port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/webrtc-bridge`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    ws.send("not-valid-json{{{");
    ws.send(JSON.stringify({ type: "offer" }));
    ws.send(JSON.stringify({ type: "offer", sdp: {} }));
    ws.send(
      JSON.stringify({
        type: "audio",
        chunks: [{ mimeType: "audio/pcm;rate=0", dataBase64: "AAAA" }],
      }),
    );
    ws.send(
      JSON.stringify({
        type: "audio",
        chunks: [{ mimeType: "audio/pcm;rate=24000", dataBase64: "!!!" }],
      }),
    );
    ws.send("x".repeat(1_100_000));

    await new Promise((r) => setTimeout(r, 80));
    assertEquals(ws.readyState, WebSocket.OPEN);

    ws.close();
    await server.shutdown();
  },
);

Deno.test("[CRITICAL-07] & [CRITICAL-08] isSafeIceCandidate and verifyTwilioStreamRequest block SSRF candidates and forged Twilio signatures", () => {
  assertEquals(
    isSafeIceCandidate(
      "candidate:1 1 udp 2130706431 34.71.16.134 3478 typ relay raddr 192.168.1.5 rport 50000",
    ),
    true,
  );
  assertEquals(isSafeIceCandidate(""), true);
  assertFalse(
    isSafeIceCandidate("candidate:1 1 udp 2130706431 127.0.0.1 5000 typ host"),
  );
  assertFalse(
    isSafeIceCandidate(
      "candidate:1 1 udp 2130706431 169.254.169.254 80 typ host",
    ),
  );
  assertFalse(
    isSafeIceCandidate("candidate:1 1 udp 2130706431 10.0.0.5 5000 typ host"),
  );
  assertFalse(
    isSafeIceCandidate(
      "candidate:1 1 udp 2130706431 192.168.1.10 5000 typ host",
    ),
  );
  assertFalse(
    isSafeIceCandidate("candidate:1 1 udp 2130706431 172.16.0.1 5000 typ host"),
  );
  assertFalse(
    isSafeIceCandidate("candidate:1 1 udp 2130706431 100.64.1.1 5000 typ host"),
  );
  assertFalse(
    isSafeIceCandidate("candidate:1 1 udp 2130706431 ::1 5000 typ host"),
  );
  assertFalse(
    isSafeIceCandidate("candidate:1 1 udp 2130706431 fe80::1 5000 typ host"),
  );
  assertFalse(
    isSafeIceCandidate(
      "candidate:1 1 udp 2130706431 laptop.local 5000 typ host",
    ),
  );

  const secret = "twilio-super-secret";
  const streamUrl = "wss://voice.prompt2bot.com/twilio-voice/stream?callId=abc";
  const validTwilioSig = createHmac("sha1", secret)
    .update(streamUrl)
    .digest("base64");

  assertEquals(
    verifyTwilioStreamRequest(
      new Request("http://127.0.0.1:8080/twilio-voice/stream?callId=abc", {
        headers: {
          host: "voice.prompt2bot.com",
          "x-twilio-signature": validTwilioSig,
        },
      }),
      secret,
    ),
    true,
  );
  assertFalse(
    verifyTwilioStreamRequest(
      new Request("http://127.0.0.1:8080/twilio-voice/stream?callId=abc", {
        headers: {
          host: "voice.prompt2bot.com",
          "x-twilio-signature": "forged-sig",
        },
      }),
      secret,
    ),
  );

  const nowTs = String(Date.now());
  const validQuerySig = createHmac("sha256", secret)
    .update(`/twilio-voice/stream:${nowTs}`)
    .digest("hex");
  assertEquals(
    verifyTwilioStreamRequest(
      new Request(
        `http://127.0.0.1:8080/twilio-voice/stream?ts=${nowTs}&sig=${validQuerySig}`,
      ),
      secret,
    ),
    true,
  );
  const expiredTs = String(Date.now() - 10 * 60 * 1000);
  const expiredSig = createHmac("sha256", secret)
    .update(`/twilio-voice/stream:${expiredTs}`)
    .digest("hex");
  assertFalse(
    verifyTwilioStreamRequest(
      new Request(
        `http://127.0.0.1:8080/twilio-voice/stream?ts=${expiredTs}&sig=${expiredSig}`,
      ),
      secret,
    ),
  );
});
