import { assert, assertEquals } from "@std/assert";
import type {
  Credentials,
  DecipheredMessage,
} from "../../protocol/src/clientApi.ts";
import { makeCreateVoiceCall, type VoiceCallDeps } from "./voice-call.ts";

const credentials: Credentials = {
  publicSignKey: "me",
  privateSignKey: "priv",
  privateEncryptKey: "enc",
};

type SentCall = {
  action: string;
  callId: string;
  sdp?: string;
  conversation: string;
};

const makeFakePc = () => {
  const listeners = new Map<string, (() => void)[]>();
  const pc = {
    iceGatheringState: "complete" as RTCIceGatheringState,
    localDescription: { sdp: "v=0\r\nfake-sdp" } as RTCSessionDescription,
    connectionState: "new" as RTCPeerConnectionState,
    iceConnectionState: "new" as RTCIceConnectionState,
    oniceconnectionstatechange: null as ((() => void) | null),
    onconnectionstatechange: null as ((() => void) | null),
    ontrack: null as ((e: RTCTrackEvent) => void) | null,
    addTrack: () => ({} as RTCRtpSender),
    createOffer: () => Promise.resolve({ type: "offer", sdp: "fake-offer" }),
    createAnswer: () => Promise.resolve({ type: "answer", sdp: "fake-answer" }),
    setLocalDescription: () => Promise.resolve(),
    setRemoteDescription: () => Promise.resolve(),
    close: () => {},
    addEventListener: (e: string, f: () => void) => {
      listeners.set(e, [...(listeners.get(e) ?? []), f]);
    },
    removeEventListener: (e: string, f: () => void) => {
      listeners.set(e, (listeners.get(e) ?? []).filter((x) => x !== f));
    },
  };
  return pc as unknown as RTCPeerConnection;
};

const makeFakeStream = () => ({
  getTracks: () => [],
  getAudioTracks: () => [],
} as unknown as MediaStream);

const makeDeps = (sent: SentCall[]): VoiceCallDeps => ({
  createPeerConnection: makeFakePc,
  getUserAudioStream: () => Promise.resolve(makeFakeStream()),
  sendCall: ({ action, callId, sdp, conversation }) => {
    sent.push({ action, callId, sdp, conversation });
    return Promise.resolve();
  },
  playRingbackTone: () => {},
  playHangupSound: () => {},
  stopTone: () => {},
  now: () => 1_000_000,
});

Deno.test("startCall transitions to calling immediately and sends offer", async () => {
  const sent: SentCall[] = [];
  const changes: string[] = [];
  const ctrl = makeCreateVoiceCall(makeDeps(sent))({
    conversationId: "conv1",
    credentials,
    getConversationKey: () => "convkey",
    getMessages: () => [],
    onChange: () => changes.push(ctrl.getState()),
  });

  const promise = ctrl.startCall();
  assertEquals(ctrl.getState(), "calling");
  assert(changes.includes("calling"));

  await promise;
  assertEquals(sent.length, 1);
  assertEquals(sent[0].action, "offer");
  assertEquals(sent[0].conversation, "conv1");
  assert(sent[0].sdp && sent[0].sdp.length > 0);
  ctrl.cleanup();
});

Deno.test("startCall no-ops without conversation key", async () => {
  const sent: SentCall[] = [];
  const ctrl = makeCreateVoiceCall(makeDeps(sent))({
    conversationId: "conv1",
    credentials,
    getConversationKey: () => null,
    getMessages: () => [],
    onChange: () => {},
  });
  await ctrl.startCall();
  assertEquals(ctrl.getState(), "idle");
  assertEquals(sent.length, 0);
});

Deno.test("incoming offer from other user transitions idle to ringing", () => {
  const ctrl = makeCreateVoiceCall(makeDeps([]))({
    conversationId: "conv1",
    credentials,
    getConversationKey: () => "convkey",
    getMessages: () => [
      {
        id: "m1",
        type: "call",
        callId: "c1",
        action: "offer",
        sdp: "fake",
        publicSignKey: "other",
        timestamp: 1_000_000,
      } as DecipheredMessage,
    ],
    onChange: () => {},
  });
  ctrl.handleMessages();
  assertEquals(ctrl.getState(), "ringing");
});

Deno.test("stale offer does not trigger ringing", () => {
  const ctrl = makeCreateVoiceCall(makeDeps([]))({
    conversationId: "conv1",
    credentials,
    getConversationKey: () => "convkey",
    getMessages: () => [
      {
        id: "m1",
        type: "call",
        callId: "c1",
        action: "offer",
        sdp: "fake",
        publicSignKey: "other",
        timestamp: 0,
      } as DecipheredMessage,
    ],
    onChange: () => {},
  });
  ctrl.handleMessages();
  assertEquals(ctrl.getState(), "idle");
});

Deno.test("own messages do not trigger ringing", () => {
  const ctrl = makeCreateVoiceCall(makeDeps([]))({
    conversationId: "conv1",
    credentials,
    getConversationKey: () => "convkey",
    getMessages: () => [
      {
        id: "m1",
        type: "call",
        callId: "c1",
        action: "offer",
        sdp: "fake",
        publicSignKey: "me",
        timestamp: 1_000_000,
      } as DecipheredMessage,
    ],
    onChange: () => {},
  });
  ctrl.handleMessages();
  assertEquals(ctrl.getState(), "idle");
});
