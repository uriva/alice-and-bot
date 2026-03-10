import { useEffect, useRef, useState } from "preact/hooks";
import {
  type Credentials,
  type DecipheredMessage,
  sendMessageWithKey,
} from "../../../protocol/src/clientApi.ts";

import type { InstantReactWebDatabase } from "@instantdb/react";
import type schema from "../../../instant.schema.ts";

export type CallState =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "active"
  | "ended";

export const useVoiceCall = ({
  conversationId,
  credentials,
  conversationKey,
  messages,
}: {
  db: InstantReactWebDatabase<typeof schema>;
  conversationId: string;
  credentials: Credentials;
  conversationKey: string | null;
  messages: DecipheredMessage[];
}) => {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callDuration, setCallDuration] = useState<number>(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const durationIntervalRef = useRef<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<number | null>(null);

  const playRingbackTone = () => {
    stopTone();
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);

    const pulseTone = () => {
      const t = ctx.currentTime;
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(0.1, t + 0.1);
      gainNode.gain.setValueAtTime(0.1, t + 1.5);
      gainNode.gain.linearRampToValueAtTime(0, t + 1.6);
    };

    pulseTone();
    // US ringback is typically 2s on, 4s off. We'll do 1.5s on, 2.5s off.
    intervalRef.current = setInterval(pulseTone, 4000);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();

    oscillatorRef.current = osc;
    gainNodeRef.current = gainNode;
  };

  const playHangupSound = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };

  const stopTone = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setValueAtTime(
        0,
        audioContextRef.current?.currentTime || 0,
      );
    }
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (_e) {
        // ignore if already stopped
      }
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
  };

  useEffect(() => () => cleanupCall(), []);

  useEffect(() => {
    const callMessages = messages.filter((m) => m.type === "call").sort((
      a,
      b,
    ) => b.timestamp - a.timestamp);
    if (callMessages.length === 0) return;
    const latest = callMessages[0] as DecipheredMessage & { type: "call" };

    // Ignore my own messages for answering logic, unless it's a reject/end
    const isMine = latest.publicSignKey === credentials.publicSignKey;
    const isStale = Date.now() - latest.timestamp > 45000;

    // Only process state changes if the message belongs to our active call,
    // OR if we are idle and it's a new incoming offer
    if (callState !== "idle" && latest.callId !== activeCallIdRef.current) {
      return;
    }

    if (latest.action === "offer" && callState === "idle" && !isMine) {
      if (!isStale) {
        activeCallIdRef.current = latest.callId;
        setCallState("ringing");
      }
    } else if (latest.action === "reject" || latest.action === "end") {
      if (callState !== "idle") {
        if (!isMine) playHangupSound();
        cleanupCall();
        setCallState("idle");
      }
    } else if (
      latest.action === "answer" && callState === "calling" && !isMine
    ) {
      // remote answered our offer
      setCallState("connecting");
      stopTone();
      if (pcRef.current && latest.sdp) {
        const sdpString = typeof latest.sdp === "string"
          ? latest.sdp
          : (latest.sdp as { sdp: string }).sdp;
        pcRef.current.setRemoteDescription({ type: "answer", sdp: sdpString })
          .then(() => {
            setCallState("active");
            startDurationTimer();
          })
          .catch(console.error);
      } else if (!pcRef.current) {
        setCallState("active");
        startDurationTimer();
      }
    }
  }, [messages, callState, credentials.publicSignKey]);

  const startDurationTimer = () => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    setCallDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000) as unknown as number;
  };

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setRemoteStream(null);
    activeCallIdRef.current = null;
    stopTone();
  };

  const createPeerConnection = (_callId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (_event) => {
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        cleanupCall();
        setCallState("idle");
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      setCallState("active");
      startDurationTimer();
      stopTone();
    };

    return pc;
  };

  const startCall = async () => {
    if (!conversationKey) return;
    const callId = crypto.randomUUID();
    activeCallIdRef.current = callId;
    setCallState("calling");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      playRingbackTone();

      const pc = createPeerConnection(callId);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", checkState);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", checkState);
          setTimeout(() => {
            pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }, 2000);
        }
      });

      await sendMessageWithKey({
        conversationKey,
        credentials,
        conversation: conversationId,
        message: {
          type: "call",
          callId,
          action: "offer",
          sdp: pc.localDescription!.sdp,
        },
      });
    } catch (e) {
      console.error(e);
      stopTone();
      cleanupCall();
      setCallState("idle");
    }
  };

  const acceptCall = async () => {
    if (!conversationKey || !activeCallIdRef.current) return;
    const callId = activeCallIdRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection(callId);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Find the offer
      const offerMsg = messages.find((m) =>
        m.type === "call" && m.callId === callId && m.action === "offer"
      );
      if (
        offerMsg?.type === "call" && offerMsg.action === "offer" && offerMsg.sdp
      ) {
        const sdpString = typeof offerMsg.sdp === "string"
          ? offerMsg.sdp
          : (offerMsg.sdp as { sdp: string }).sdp;
        await pc.setRemoteDescription({ type: "offer", sdp: sdpString });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === "complete") {
            resolve();
          } else {
            const checkState = () => {
              if (pc.iceGatheringState === "complete") {
                pc.removeEventListener("icegatheringstatechange", checkState);
                resolve();
              }
            };
            pc.addEventListener("icegatheringstatechange", checkState);
            setTimeout(() => {
              pc.removeEventListener("icegatheringstatechange", checkState);
              resolve();
            }, 2000);
          }
        });

        await sendMessageWithKey({
          conversationKey,
          credentials,
          conversation: conversationId,
          message: {
            type: "call",
            callId,
            action: "answer",
            sdp: pc.localDescription!.sdp,
          },
        });
        setCallState("connecting");
        startDurationTimer();
      }
    } catch (e) {
      console.error(e);
      cleanupCall();
      setCallState("idle");
    }
  };

  const rejectCall = async () => {
    if (!conversationKey) return;
    playHangupSound();
    const callId = activeCallIdRef.current;
    cleanupCall();
    setCallState("idle");
    if (callId) {
      await sendMessageWithKey({
        conversationKey,
        credentials,
        conversation: conversationId,
        message: {
          type: "call",
          callId,
          action: "reject",
        },
      });
    }
  };

  const endCall = async () => {
    if (!conversationKey) return;
    playHangupSound();
    const callId = activeCallIdRef.current;
    cleanupCall();
    setCallState("idle");
    if (callId) {
      await sendMessageWithKey({
        conversationKey,
        credentials,
        conversation: conversationId,
        message: { type: "call", callId, action: "end" },
      });
    }
  };

  return {
    callState,
    callDuration,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
};
