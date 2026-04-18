import type {
  CallAction,
  Credentials,
  DecipheredMessage,
} from "../../protocol/src/clientApi.ts";
import { sendMessageWithKey } from "../../protocol/src/clientApi.ts";

export type CallState =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "active";

type CallMsg = DecipheredMessage & { type: "call" };

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:34.71.16.134:3478",
    username: "turnuser",
    credential: "c4667414eb0867040af94292a6c5e3c0",
  },
];

const staleAgeMs = 45_000;
const iceGatheringTimeoutMs = 2_000;

const isCallMsg = (m: DecipheredMessage): m is CallMsg => m.type === "call";

const latestCallMessage = (messages: DecipheredMessage[]): CallMsg | null => {
  const calls = messages.filter(isCallMsg);
  if (calls.length === 0) return null;
  return calls.reduce((a, b) => a.timestamp >= b.timestamp ? a : b);
};

const sdpString = (sdp: unknown): string | null => {
  if (typeof sdp === "string") return sdp;
  if (sdp && typeof sdp === "object" && "sdp" in sdp) {
    const s = (sdp as { sdp: unknown }).sdp;
    return typeof s === "string" ? s : null;
  }
  return null;
};

const awaitIceGathering = (pc: RTCPeerConnection) =>
  new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, iceGatheringTimeoutMs);
  });

export type VoiceCallDeps = {
  createPeerConnection: () => RTCPeerConnection;
  getUserAudioStream: () => Promise<MediaStream>;
  sendCall: (params: {
    credentials: Credentials;
    conversationKey: string;
    conversation: string;
    callId: string;
    action: CallAction;
    sdp?: string;
  }) => Promise<unknown>;
  playRingbackTone: () => void;
  playHangupSound: () => void;
  stopTone: () => void;
  now: () => number;
};

export type VoiceCallParams = {
  conversationId: string;
  credentials: Credentials;
  getConversationKey: () => string | null;
  getMessages: () => DecipheredMessage[];
  onChange: () => void;
};

export type VoiceCallController = {
  getState: () => CallState;
  getDuration: () => number;
  getMuted: () => boolean;
  getRemoteStream: () => MediaStream | null;
  handleMessages: () => void;
  startCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  cleanup: () => void;
};

const defaultCreatePeerConnection = () => new RTCPeerConnection({ iceServers });

const defaultGetUserAudioStream = () =>
  navigator.mediaDevices.getUserMedia({ audio: true });

const defaultSendCall = (
  { credentials, conversationKey, conversation, callId, action, sdp }: {
    credentials: Credentials;
    conversationKey: string;
    conversation: string;
    callId: string;
    action: CallAction;
    sdp?: string;
  },
) =>
  sendMessageWithKey({
    conversationKey,
    credentials,
    conversation,
    message: sdp ? { type: "call", callId, action, sdp } : {
      type: "call",
      callId,
      action,
    },
  });

const makeAudioTonePlayer = () => {
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gainNode: GainNode | null = null;
  let interval: number | null = null;

  const getCtx = () => {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };

  const stopTone = () => {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
    if (gainNode && ctx) gainNode.gain.setValueAtTime(0, ctx.currentTime);
    if (osc) {
      try {
        osc.stop();
      } catch (_e) { /* already stopped */ }
      osc.disconnect();
      osc = null;
    }
  };

  const playRingbackTone = () => {
    stopTone();
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(440, c.currentTime);
    const pulse = () => {
      const t = c.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.1);
      g.gain.setValueAtTime(0.1, t + 1.5);
      g.gain.linearRampToValueAtTime(0, t + 1.6);
    };
    pulse();
    interval = setInterval(pulse, 4000) as unknown as number;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    osc = o;
    gainNode = g;
  };

  const playHangupSound = () => {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(400, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.3);
    g.gain.setValueAtTime(0.1, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.3);
  };

  return { playRingbackTone, playHangupSound, stopTone };
};

const defaultDeps = (): VoiceCallDeps => {
  const tones = makeAudioTonePlayer();
  return {
    createPeerConnection: defaultCreatePeerConnection,
    getUserAudioStream: defaultGetUserAudioStream,
    sendCall: defaultSendCall,
    playRingbackTone: tones.playRingbackTone,
    playHangupSound: tones.playHangupSound,
    stopTone: tones.stopTone,
    now: () => Date.now(),
  };
};

export const makeCreateVoiceCall =
  (deps: VoiceCallDeps) => (params: VoiceCallParams): VoiceCallController => {
    let state: CallState = "idle";
    let duration = 0;
    let muted = false;
    let remoteStream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;
    let activeCallId: string | null = null;
    let durationInterval: number | null = null;
    let lastProcessedCallMsgId: string | null = null;

    const setState = (next: CallState) => {
      if (state === next) return;
      state = next;
      params.onChange();
    };

    const setDuration = (n: number) => {
      if (duration === n) return;
      duration = n;
      params.onChange();
    };

    const setMuted = (b: boolean) => {
      if (muted === b) return;
      muted = b;
      params.onChange();
    };

    const setRemoteStream = (s: MediaStream | null) => {
      if (remoteStream === s) return;
      remoteStream = s;
      params.onChange();
    };

    const startDurationTimer = () => {
      if (durationInterval !== null) clearInterval(durationInterval);
      setDuration(0);
      durationInterval = setInterval(() => {
        setDuration(duration + 1);
      }, 1000) as unknown as number;
    };

    const cleanup = () => {
      localStream?.getTracks().forEach((t) => t.stop());
      localStream = null;
      if (pc) {
        pc.close();
        pc = null;
      }
      if (durationInterval !== null) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
      setRemoteStream(null);
      activeCallId = null;
      setMuted(false);
      deps.stopTone();
    };

    const buildPc = () => {
      const newPc = deps.createPeerConnection();
      newPc.oniceconnectionstatechange = () => {
        console.log("[webrtc] ICE state:", newPc.iceConnectionState);
      };
      newPc.onconnectionstatechange = () => {
        if (
          newPc.connectionState === "disconnected" ||
          newPc.connectionState === "failed" ||
          newPc.connectionState === "closed"
        ) {
          cleanup();
          setState("idle");
        }
      };
      newPc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        setState("active");
        startDurationTimer();
        deps.stopTone();
      };
      return newPc;
    };

    const sendCall = (
      action: CallAction,
      callId: string,
      sdp?: string,
    ): Promise<unknown> => {
      const key = params.getConversationKey();
      if (!key) return Promise.resolve();
      return deps.sendCall({
        credentials: params.credentials,
        conversationKey: key,
        conversation: params.conversationId,
        callId,
        action,
        sdp,
      });
    };

    const startCall = async () => {
      if (!params.getConversationKey()) return;
      const callId = crypto.randomUUID();
      activeCallId = callId;
      setState("calling");
      try {
        localStream = await deps.getUserAudioStream();
        deps.playRingbackTone();
        pc = buildPc();
        const currentPc = pc;
        const stream = localStream;
        stream.getTracks().forEach((t) => currentPc.addTrack(t, stream));
        const offer = await currentPc.createOffer();
        await currentPc.setLocalDescription(offer);
        await awaitIceGathering(currentPc);
        await sendCall("offer", callId, currentPc.localDescription?.sdp);
      } catch (e) {
        console.error(e);
        deps.stopTone();
        cleanup();
        setState("idle");
      }
    };

    const acceptCall = async () => {
      const callId = activeCallId;
      if (!params.getConversationKey() || !callId) return;
      try {
        localStream = await deps.getUserAudioStream();
        pc = buildPc();
        const currentPc = pc;
        const stream = localStream;
        stream.getTracks().forEach((t) => currentPc.addTrack(t, stream));
        const offerMsg = params.getMessages().find((m): m is CallMsg =>
          isCallMsg(m) && m.callId === callId && m.action === "offer"
        );
        const sdp = offerMsg ? sdpString(offerMsg.sdp) : null;
        if (!sdp) throw new Error("No offer SDP found");
        await currentPc.setRemoteDescription({ type: "offer", sdp });
        const answer = await currentPc.createAnswer();
        await currentPc.setLocalDescription(answer);
        await awaitIceGathering(currentPc);
        await sendCall("answer", callId, currentPc.localDescription?.sdp);
        setState("connecting");
        startDurationTimer();
      } catch (e) {
        console.error(e);
        cleanup();
        setState("idle");
      }
    };

    const rejectCall = async () => {
      if (!params.getConversationKey()) return;
      deps.playHangupSound();
      const callId = activeCallId;
      cleanup();
      setState("idle");
      if (callId) await sendCall("reject", callId);
    };

    const endCall = async () => {
      if (!params.getConversationKey()) return;
      deps.playHangupSound();
      const callId = activeCallId;
      cleanup();
      setState("idle");
      if (callId) await sendCall("end", callId);
    };

    const toggleMute = () => {
      const next = !muted;
      setMuted(next);
      localStream?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
    };

    const handleOffer = (msg: CallMsg, isMine: boolean, isStale: boolean) => {
      if (state !== "idle" || isMine || isStale) return;
      activeCallId = msg.callId;
      setState("ringing");
    };

    const handleAnswer = (msg: CallMsg, isMine: boolean) => {
      if (state !== "calling" || isMine) return;
      setState("connecting");
      deps.stopTone();
      const sdp = sdpString(msg.sdp);
      if (!pc || !sdp) {
        setState("active");
        startDurationTimer();
        return;
      }
      pc.setRemoteDescription({ type: "answer", sdp })
        .then(() => {
          setState("active");
          startDurationTimer();
        })
        .catch((e) =>
          console.error("[webrtc] setRemoteDescription failed:", e)
        );
    };

    const handleEnd = (isMine: boolean) => {
      if (state === "idle") return;
      if (!isMine) deps.playHangupSound();
      cleanup();
      setState("idle");
    };

    const handleMessages = () => {
      const latest = latestCallMessage(params.getMessages());
      if (!latest || latest.id === lastProcessedCallMsgId) return;
      lastProcessedCallMsgId = latest.id;
      const isMine = latest.publicSignKey === params.credentials.publicSignKey;
      const isStale = deps.now() - latest.timestamp > staleAgeMs;
      if (state !== "idle" && latest.callId !== activeCallId) return;
      if (latest.action === "offer") handleOffer(latest, isMine, isStale);
      else if (latest.action === "reject" || latest.action === "end") {
        handleEnd(isMine);
      } else if (latest.action === "answer") handleAnswer(latest, isMine);
    };

    return {
      getState: () => state,
      getDuration: () => duration,
      getMuted: () => muted,
      getRemoteStream: () => remoteStream,
      handleMessages,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      cleanup,
    };
  };

export const createVoiceCall = (params: VoiceCallParams) =>
  makeCreateVoiceCall(defaultDeps())(params);
