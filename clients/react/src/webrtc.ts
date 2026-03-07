import { useEffect, useRef, useState } from "preact/hooks";
import {
  type Credentials,
  type DecipheredMessage,
  sendMessageWithKey,
} from "../../../protocol/src/clientApi.ts";

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
  // deno-lint-ignore no-explicit-any
  db: any;
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

    if (latest.action === "offer" && callState === "idle" && !isMine) {
      activeCallIdRef.current = latest.callId;
      setCallState("ringing");
    } else if (latest.action === "reject" || latest.action === "end") {
      cleanupCall();
      setCallState("idle");
    } else if (
      latest.action === "answer" && callState === "calling" && !isMine
    ) {
      // remote answered our offer
      setCallState("connecting");
      if (pcRef.current && latest.sdp) {
        pcRef.current.setRemoteDescription({ type: "answer", sdp: latest.sdp })
          .then(() => setCallState("active"))
          .catch(console.error);
      }
    }
  }, [messages, callState, credentials.publicSignKey]);

  // Handle ICE candidates via InstantDB room
  useEffect(() => {
    if (!conversationId) return;
    const room = db.room("conversations", conversationId);

    // deno-lint-ignore no-explicit-any
    const unsub = room.subscribeTopic("ice_candidate", (event: any) => {
      if (event.data.peerId === credentials.publicSignKey) return; // skip own
      if (event.data.callId !== activeCallIdRef.current) return; // skip old
      if (pcRef.current && event.data.candidate) {
        pcRef.current.addIceCandidate(event.data.candidate).catch(
          console.error,
        );
      }
    });

    return unsub;
  }, [db, conversationId, credentials.publicSignKey]);

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
  };

  const createPeerConnection = (callId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        db.room("conversations", conversationId).publishTopic("ice_candidate", {
          peerId: credentials.publicSignKey,
          callId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      setCallState("active");
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
        // deno-lint-ignore no-explicit-any
      ) as any;
      if (offerMsg?.sdp) {
        await pc.setRemoteDescription({ type: "offer", sdp: offerMsg.sdp });
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
