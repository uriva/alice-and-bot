import { Buffer } from "node:buffer";
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RtpHeader,
  RtpPacket,
} from "werift";
import { Decoder, Encoder } from "@evan/opus";

const _server = Deno.serve({ port: 8080 }, (req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Not a websocket request", { status: 400 });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);

  let pc: RTCPeerConnection | null = null;
  const decoder = new Decoder({ sample_rate: 48000, channels: 1 });
  const encoder = new Encoder({
    sample_rate: 48000,
    channels: 1,
    application: "voip",
  });

  let outTrack: MediaStreamTrack | null = null;
  let outSequenceNumber = 0;
  let outTimestamp = 0;

  // We buffer outgoing PCM so we can slice it into exactly 20ms frames (960 samples @ 48kHz = 1920 bytes of Int16)
  let pcmBuffer = new Int16Array(0);
  const FRAME_SIZE = 960; // 20ms at 48000 Hz
  let pacingInterval: ReturnType<typeof setInterval> | null = null;

  const sendOneFrame = () => {
    if (!outTrack || pcmBuffer.length < FRAME_SIZE) {
      if (pacingInterval) {
        clearInterval(pacingInterval);
        pacingInterval = null;
      }
      return;
    }
    const frame = pcmBuffer.slice(0, FRAME_SIZE);
    pcmBuffer = pcmBuffer.slice(FRAME_SIZE);
    try {
      const opusData = encoder.encode(frame);
      const header = new RtpHeader({
        sequenceNumber: outSequenceNumber++,
        timestamp: outTimestamp,
        payloadType: outTrack.codec?.payloadType ?? 111,
        extension: false,
        marker: false,
      });
      outTimestamp += FRAME_SIZE;
      const rtp = new RtpPacket(header, Buffer.from(opusData));
      outTrack.writeRtp(rtp);
    } catch (e) {
      console.error("Failed to encode/send audio", e);
    }
  };

  const processPcmBuffer = () => {
    if (!outTrack || pcmBuffer.length < FRAME_SIZE || pacingInterval) return;
    pacingInterval = setInterval(sendOneFrame, 20);
  };

  socket.onopen = () => {
    console.log("WebSocket connection established");
  };

  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "offer") {
      console.log("Received offer");
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.connectionStateChange.subscribe((state) => {
        console.log("ICE connection state:", state);
      });
      pc.onIceCandidate.subscribe((candidate) => {
        if (candidate) {
          socket.send(JSON.stringify({ type: "candidate", candidate }));
        }
      });

      outTrack = new MediaStreamTrack({ kind: "audio" });
      const audioTransceiver = pc.addTransceiver(outTrack, {
        direction: "sendrecv",
      });

      audioTransceiver.onTrack.subscribe((track) => {
        console.log("Got remote audio track");
        let firstRtp = false;
        track.onReceiveRtp.subscribe((rtp) => {
          if (!firstRtp) {
            console.log("Received first RTP packet from browser!");
            firstRtp = true;
          }
          try {
            // Browser sends us Opus RTP. Decode to 48kHz PCM.
            const pcmBytes = decoder.decode(rtp.payload);
            if (Math.random() < 0.05) {
              console.log("Decoded PCM bytes length:", pcmBytes.length);
            }
            const pcm = new Int16Array(
              pcmBytes.buffer,
              pcmBytes.byteOffset,
              pcmBytes.byteLength / 2,
            );

            // Resample 48kHz to 16kHz to send less data to prompt2bot and Gemini
            const outLength = Math.floor(pcm.length / 3);
            const resampled = new Int16Array(outLength);
            for (let i = 0; i < outLength; i++) {
              resampled[i] = pcm[i * 3];
            }

            // Base64 encode the raw Int16Array buffer
            const base64 = btoa(
              String.fromCharCode(...new Uint8Array(resampled.buffer)),
            );
            socket.send(JSON.stringify({
              type: "audio",
              chunks: [{
                mimeType: "audio/pcm;rate=16000",
                dataBase64: base64,
              }],
            }));
          } catch (e) {
            console.error("Failed to decode RTP", e);
          }
        });
      });

      await pc.setRemoteDescription({
        type: "offer",
        sdp: typeof msg.sdp === "string" ? msg.sdp : msg.sdp.sdp,
      });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await new Promise<void>((resolve) => {
        if (pc!.iceGatheringState === "complete") {
          resolve();
        } else {
          const timeout = setTimeout(() => resolve(), 2000);
          const sub = pc!.iceGatheringStateChange.subscribe((state) => {
            if (state === "complete") {
              clearTimeout(timeout);
              sub.unSubscribe();
              resolve();
            }
          });
        }
      });

      socket.send(
        JSON.stringify({
          type: "answer",
          sdp: { type: "answer", sdp: pc!.localDescription!.sdp },
        }),
      );
    } else if (msg.type === "error") {
      console.error("Received error from prompt2bot:", msg.message);
    } else if (msg.type === "candidate") {
      console.log("Received remote ICE candidate", msg.candidate);
      if (pc) {
        await pc.addIceCandidate(msg.candidate);
      }
    } else if (msg.type === "audio" && (msg.chunk || msg.chunks)) {
      if (outSequenceNumber === 0) {
        console.log("Received first audio chunk from Gemini!");
      }
      // Audio from prompt2bot (Gemini) -> browser
      // Gemini sends audio/pcm;rate=24000 (or 16000)
      const chunks = msg.chunks || [msg.chunk];

      for (const chunk of chunks) {
        const mimeType = chunk.mimeType as string;
        const rateMatch = mimeType.match(/rate=(\d+)/);
        const inputRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

        const bytes = Uint8Array.from(
          atob(chunk.dataBase64),
          (c) => c.charCodeAt(0),
        );
        const inputPcm = new Int16Array(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength / 2,
        );

        // Resample to 48000 Hz if needed
        let resampled = inputPcm;
        if (inputRate !== 48000) {
          const ratio = 48000 / inputRate;
          resampled = new Int16Array(inputPcm.length * ratio);
          for (let i = 0; i < resampled.length; i++) {
            resampled[i] = inputPcm[Math.floor(i / ratio)];
          }
        }

        // Append to pcmBuffer
        const newBuffer = new Int16Array(pcmBuffer.length + resampled.length);
        newBuffer.set(pcmBuffer, 0);
        newBuffer.set(resampled, pcmBuffer.length);
        pcmBuffer = newBuffer;
      }

      processPcmBuffer();
    }
  };

  socket.onerror = (e) => console.error("WebSocket error:", e);
  socket.onclose = () => {
    console.log("WebSocket closed");
    if (pacingInterval) clearInterval(pacingInterval);
    if (pc) pc.close();
  };

  return response;
});
