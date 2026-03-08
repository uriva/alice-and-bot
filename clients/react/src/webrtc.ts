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
  db,
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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<number | null>(null);

  const playRingbackTone = () => {
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

  // Derive call state from messages? For simplicity, we just look at the latest call message for this conversation.
  useEffect(() => {
    const callMessages = messages.filter((m) => m.type === "call").sort((
      a,
      b,
    ) => b.timestamp - a.timestamp);
    if (callMessages.length === 0) return;
    const latest = callMessages[0] as DecipheredMessage & { type: "call" };

    // Ignore my own messages for answering logic, unless it's a reject/end
    const isMine = latest.publicSignKey === credentials.publicSignKey;

    // Only process state changes if the message belongs to our active call,
    // OR if we are idle and it's a new incoming offer
    if (callState !== "idle" && latest.callId !== activeCallIdRef.current) {
      return;
    }

    if (latest.action === "offer" && callState === "idle" && !isMine) {
      activeCallIdRef.current = latest.callId;
      setCallState("ringing");
    } else if (latest.action === "offer" && callState === "idle" && isMine) {
      activeCallIdRef.current = latest.callId;
      setCallState("calling");
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
          .then(() => setCallState("active"))
          .catch(console.error);
      } else if (!pcRef.current) {
        setCallState("active");
      }
    } else if (latest.action === "answer" && callState === "idle") {
      activeCallIdRef.current = latest.callId;
      setCallState("active");
    }
  }, [messages, callState, credentials.publicSignKey]);

  // Handle ICE candidates via InstantDB room
  const room = db.room("conversations", conversationId);
  const publishIceCandidate = room.usePublishTopic("ice_candidate");

  room.useTopicEffect("ice_candidate", (event) => {
    if (event.peerId === credentials.publicSignKey) return; // skip own
    if (event.callId !== activeCallIdRef.current) return; // skip old
    if (pcRef.current && event.candidate) {
      pcRef.current.addIceCandidate(event.candidate).catch(
        console.error,
      );
    }
  });

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    activeCallIdRef.current = null;
    stopTone();
  };

  const createPeerConnection = (callId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        publishIceCandidate({
          peerId: credentials.publicSignKey,
          callId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      setCallState("active");
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

      await sendMessageWithKey({
        conversationKey,
        credentials,
        conversation: conversationId,
        message: { type: "call", callId, action: "offer", sdp: offer.sdp },
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

        await sendMessageWithKey({
          conversationKey,
          credentials,
          conversation: conversationId,
          message: { type: "call", callId, action: "answer", sdp: answer.sdp },
        });
        setCallState("connecting");
      }
    } catch (e) {
      console.error(e);
      cleanupCall();
      setCallState("idle");
    }
  };

  const rejectCall = async () => {
    if (!conversationKey || !activeCallIdRef.current) return;
    playHangupSound();
    await sendMessageWithKey({
      conversationKey,
      credentials,
      conversation: conversationId,
      message: {
        type: "call",
        callId: activeCallIdRef.current,
        action: "reject",
      },
    });
    cleanupCall();
    setCallState("idle");
  };

  const endCall = async () => {
    if (!conversationKey || !activeCallIdRef.current) return;
    playHangupSound();
    await sendMessageWithKey({
      conversationKey,
      credentials,
      conversation: conversationId,
      message: { type: "call", callId: activeCallIdRef.current, action: "end" },
    });
    cleanupCall();
    setCallState("idle");
  };

  return {
    callState,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
};
