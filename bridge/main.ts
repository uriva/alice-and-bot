import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RtpHeader,
  RtpPacket,
} from "werift";
import { Decoder, Encoder } from "@evan/opus";
import NodeWebSocket from "ws";

export const MAX_WS_FRAME_BYTES = 1_048_576;
export const MAX_PCM_BUFFER_SAMPLES = 48_000 * 30;
const MIN_INPUT_RATE = 8_000;
const MAX_INPUT_RATE = 96_000;
const MAX_SDP_LENGTH = 65_536;
const TWILIO_TS_WINDOW_MS = 5 * 60 * 1000;

const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const hexGroupPattern = /^[0-9a-f]{1,4}$/;

const parseIpv4 = (host: string): [number, number, number, number] | null => {
  const m = host.match(ipv4Pattern);
  if (!m) return null;
  const octets: [number, number, number, number] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
  ];
  return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? octets
    : null;
};

const isPrivateIpv4 = ([a, b, c]: [number, number, number, number]): boolean =>
  a === 0 ||
  a === 10 ||
  (a === 100 && b >= 64 && b <= 127) ||
  a === 127 ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 0 && (c === 0 || c === 2)) ||
  (a === 192 && b === 168) ||
  (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
  (a === 203 && b === 0 && c === 113) ||
  a >= 224;

const parseHexSegments = (part: string): number[] | null => {
  if (part === "") return [];
  const pieces = part.split(":");
  if (!pieces.every((p) => hexGroupPattern.test(p))) return null;
  return pieces.map((p) => Number.parseInt(p, 16));
};

const expandIpv6 = (raw: string): number[] | null => {
  const clean = raw.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!clean || !clean.includes(":")) return null;
  const lastColon = clean.lastIndexOf(":");
  const tailIpv4 = parseIpv4(clean.slice(lastColon + 1));
  const normalized = tailIpv4
    ? `${clean.slice(0, lastColon + 1)}${
      ((tailIpv4[0] << 8) | tailIpv4[1]).toString(16)
    }:${((tailIpv4[2] << 8) | tailIpv4[3]).toString(16)}`
    : clean;
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  if (halves.length === 1) {
    const groups = parseHexSegments(halves[0]);
    return groups && groups.length === 8 ? groups : null;
  }
  const left = parseHexSegments(halves[0]);
  const right = parseHexSegments(halves[1]);
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
};

const isPrivateIpv6 = (groups: number[]): boolean => {
  if (groups.every((g) => g === 0)) return true;
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;
  if (
    groups.slice(0, 5).every((g) => g === 0) &&
    (groups[5] === 0xffff || groups[5] === 0)
  ) {
    return isPrivateIpv4([
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ]);
  }
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  return false;
};

export const isPrivateOrReservedHost = (rawHost: string): boolean => {
  const host = rawHost.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata" ||
    host === "metadata.google.internal" ||
    host === "instance-data"
  ) {
    return true;
  }
  const v4 = parseIpv4(host);
  if (v4) return isPrivateIpv4(v4);
  const v6 = expandIpv6(host);
  if (v6) return isPrivateIpv6(v6);
  if (host.includes(":")) return true;
  return false;
};

export const isSafeIceCandidate = (candidateInput: unknown): boolean => {
  const raw = typeof candidateInput === "string"
    ? candidateInput
    : typeof candidateInput === "object" &&
        candidateInput !== null &&
        typeof Reflect.get(candidateInput, "candidate") === "string"
    ? String(Reflect.get(candidateInput, "candidate"))
    : null;
  if (raw === null) return false;
  const trimmed = raw.trim();
  if (trimmed === "") return true;
  const stripped = trimmed.startsWith("a=") ? trimmed.slice(2) : trimmed;
  if (!stripped.startsWith("candidate:")) return false;
  const tokens = stripped.split(/\s+/);
  if (tokens.length < 6) return false;
  const address = tokens[4];
  const port = Number(tokens[5]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  if (Deno.env.get("ALLOW_PRIVATE_ICE_CANDIDATES") === "1") return true;
  return !isPrivateOrReservedHost(address);
};

const sanitizeIncomingOfferSdp = (sdp: string): string =>
  sdp
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("a=candidate:")) return true;
      return isSafeIceCandidate(trimmed);
    })
    .join("\n");

const safeEqualStrings = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

export const verifyTwilioStreamRequest = (
  req: Request,
  authToken: string,
): boolean => {
  const url = new URL(req.url);
  const twilioSig = req.headers.get("x-twilio-signature");
  if (twilioSig) {
    const host = req.headers.get("host");
    const candidates = [
      req.url,
      ...(host
        ? [
          `wss://${host}${url.pathname}${url.search}`,
          `https://${host}${url.pathname}${url.search}`,
          `ws://${host}${url.pathname}${url.search}`,
          `http://${host}${url.pathname}${url.search}`,
        ]
        : []),
    ];
    return candidates.some((candidateUrl) => {
      const expected = createHmac("sha1", authToken)
        .update(candidateUrl)
        .digest("base64");
      return safeEqualStrings(twilioSig, expected);
    });
  }
  const tsParam = url.searchParams.get("ts");
  const sigParam = url.searchParams.get("sig");
  if (tsParam && sigParam) {
    const rawTs = Number(tsParam);
    if (!Number.isFinite(rawTs) || rawTs <= 0) return false;
    const tsMs = rawTs < 1e12 ? rawTs * 1000 : rawTs;
    if (Math.abs(Date.now() - tsMs) > TWILIO_TS_WINDOW_MS) return false;
    const expectedHex = createHmac("sha256", authToken)
      .update(`${url.pathname}:${tsParam}`)
      .digest("hex");
    return safeEqualStrings(sigParam.toLowerCase(), expectedHex.toLowerCase());
  }
  return false;
};

const ensureCandidatesInSdp = (sdp: string, candidates: string[]): string => {
  const missing = candidates.filter((c) => !sdp.includes(c));
  if (missing.length === 0) return sdp;
  const candidateLines = missing.map((c) => c.startsWith("a=") ? c : `a=${c}`);
  const marker = "\r\na=ice-ufrag:";
  const idx = sdp.indexOf(marker);
  return idx !== -1
    ? `${sdp.slice(0, idx)}\r\n${candidateLines.join("\r\n")}${sdp.slice(idx)}`
    : `${sdp.trimEnd()}\r\n${candidateLines.join("\r\n")}\r\n`;
};

const wsFrameByteLength = (data: unknown): number => {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).byteLength;
  }
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return Number.POSITIVE_INFINITY;
};

const extractOfferSdp = (sdpField: unknown): string | null => {
  if (typeof sdpField === "string") return sdpField;
  if (typeof sdpField === "object" && sdpField !== null) {
    const nested = Reflect.get(sdpField, "sdp");
    if (typeof nested === "string") return nested;
  }
  return null;
};

export const handleRequest = (req: Request): Response => {
  const url = new URL(req.url);
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Not a websocket request", { status: 400 });
  }
  if (url.pathname === "/twilio-voice/stream") {
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
    if (twilioAuthToken && !verifyTwilioStreamRequest(req, twilioAuthToken)) {
      return new Response("Forbidden", { status: 403 });
    }
    return proxyTwilioStream(req);
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
  let mediaReady = false;
  let mediaReadyFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let outSequenceNumber = 0;
  let outTimestamp = 0;

  let pcmBuffer = new Int16Array(0);
  const FRAME_SIZE = 960; // 20ms at 48000 Hz
  let pacingInterval: ReturnType<typeof setInterval> | null = null;

  const sendOneFrame = () => {
    if (!outTrack || !mediaReady || pcmBuffer.length < FRAME_SIZE) {
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
    if (
      !outTrack || !mediaReady || pcmBuffer.length < FRAME_SIZE ||
      pacingInterval
    ) {
      return;
    }
    pacingInterval = setInterval(sendOneFrame, 20);
  };

  const markMediaReady = () => {
    if (mediaReady) return;
    mediaReady = true;
    if (mediaReadyFallbackTimer) {
      clearTimeout(mediaReadyFallbackTimer);
      mediaReadyFallbackTimer = null;
    }
    processPcmBuffer();
  };

  socket.onopen = () => {
    console.log("WebSocket connection established");
  };

  socket.onmessage = async (event) => {
    try {
      if (wsFrameByteLength(event.data) > MAX_WS_FRAME_BYTES) {
        console.warn("Dropped oversized WebSocket frame");
        return;
      }
      if (typeof event.data !== "string") return;
      const msg = JSON.parse(event.data);
      if (typeof msg !== "object" || msg === null) return;

      if (msg.type === "offer") {
        const rawOfferSdp = extractOfferSdp(msg.sdp);
        if (!rawOfferSdp || rawOfferSdp.length > MAX_SDP_LENGTH) return;
        const offerSdp = sanitizeIncomingOfferSdp(rawOfferSdp);
        console.log(
          "Received offer. Candidates:",
          offerSdp
            .split("\n")
            .filter((l: string) => l.startsWith("a=candidate")),
        );
        console.log(
          "Offer media lines:",
          offerSdp.split("\n").filter((l: string) => l.startsWith("m=")),
        );

        if (pc) {
          try {
            pc.close();
          } catch {
            // ignore prior close error
          }
          pc = null;
        }

        const currentPc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
              urls: "turn:34.71.16.134:3478",
              username: "turnuser",
              credential: "c4667414eb0867040af94292a6c5e3c0",
            },
          ],
        });
        pc = currentPc;

        mediaReady = false;
        if (mediaReadyFallbackTimer) {
          clearTimeout(mediaReadyFallbackTimer);
          mediaReadyFallbackTimer = null;
        }
        const gatheredCandidates: string[] = [];
        let onPublicCandidateReady: (() => void) | null = null;

        currentPc.connectionStateChange.subscribe((state) => {
          console.log("Connection state:", state);
          if (state === "connected") markMediaReady();
        });
        currentPc.iceConnectionStateChange.subscribe((state) => {
          console.log("ICE state:", state);
        });
        currentPc.iceGatheringStateChange.subscribe((state) => {
          console.log("ICE gathering:", state);
        });
        currentPc.onIceCandidate.subscribe((candidate) => {
          if (candidate) {
            if (candidate.candidate) {
              gatheredCandidates.push(candidate.candidate);
              if (
                candidate.candidate.includes("typ srflx") ||
                candidate.candidate.includes("typ relay")
              ) {
                onPublicCandidateReady?.();
              }
            }
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "candidate", candidate }));
            }
          }
        });

        outTrack = new MediaStreamTrack({ kind: "audio" });
        const audioTransceiver = currentPc.addTransceiver(outTrack, {
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
              const pcmBytes = decoder.decode(rtp.payload);
              if (Math.random() < 0.05) {
                console.log("Decoded PCM bytes length:", pcmBytes.length);
              }
              const pcm = new Int16Array(
                pcmBytes.buffer,
                pcmBytes.byteOffset,
                Math.floor(pcmBytes.byteLength / 2),
              );

              const outLength = Math.floor(pcm.length / 3);
              const resampled = new Int16Array(outLength);
              for (let i = 0; i < outLength; i++) {
                resampled[i] = pcm[i * 3];
              }

              const base64 = btoa(
                String.fromCharCode(...new Uint8Array(resampled.buffer)),
              );
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                  type: "audio",
                  chunks: [{
                    mimeType: "audio/pcm;rate=16000",
                    dataBase64: base64,
                  }],
                }));
              }
            } catch (e) {
              console.error("Failed to decode RTP", e);
            }
          });
        });

        await currentPc.setRemoteDescription({
          type: "offer",
          sdp: offerSdp,
        });
        console.log(
          "setRemoteDescription done. ICE:",
          currentPc.iceConnectionState,
          "Gathering:",
          currentPc.iceGatheringState,
        );
        const answer = await currentPc.createAnswer();
        await currentPc.setLocalDescription(answer);
        console.log(
          "setLocalDescription done. ICE:",
          currentPc.iceConnectionState,
          "Gathering:",
          currentPc.iceGatheringState,
        );

        await new Promise<void>((resolve) => {
          if (currentPc.iceGatheringState === "complete") {
            resolve();
            return;
          }
          let settled = false;
          let settleTimer: ReturnType<typeof setTimeout> | null = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (settleTimer) clearTimeout(settleTimer);
            onPublicCandidateReady = null;
            sub.unSubscribe();
            resolve();
          };
          const scheduleQuickSettle = () => {
            const hasSrflx = gatheredCandidates.some((c) =>
              c.includes("typ srflx")
            );
            const hasRelay = gatheredCandidates.some((c) =>
              c.includes("typ relay")
            );
            if (hasSrflx && hasRelay) {
              finish();
              return;
            }
            if ((hasSrflx || hasRelay) && !settleTimer) {
              settleTimer = setTimeout(finish, 120);
            }
          };
          onPublicCandidateReady = scheduleQuickSettle;
          const timeout = setTimeout(finish, 2000);
          const sub = currentPc.iceGatheringStateChange.subscribe((state) => {
            if (state === "complete") finish();
          });
          scheduleQuickSettle();
        });

        if (!currentPc.localDescription) return;
        const answerSdp = ensureCandidatesInSdp(
          currentPc.localDescription.sdp,
          gatheredCandidates,
        );
        mediaReadyFallbackTimer = setTimeout(markMediaReady, 1500);
        console.log("Full answer SDP:\n" + answerSdp);
        console.log(
          "Post-gathering ICE:",
          currentPc.iceConnectionState,
          "Connection:",
          currentPc.connectionState,
        );
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "answer",
              sdp: { type: "answer", sdp: answerSdp },
            }),
          );
        }
      } else if (msg.type === "error") {
        console.error("Received error from prompt2bot:", msg.message);
      } else if (msg.type === "candidate") {
        if (!isSafeIceCandidate(msg.candidate)) {
          console.warn("Rejected unsafe remote ICE candidate");
          return;
        }
        console.log("Received remote ICE candidate", msg.candidate);
        if (pc) {
          await pc.addIceCandidate(msg.candidate);
        }
      } else if (msg.type === "flush") {
        pcmBuffer = new Int16Array(0);
        if (pacingInterval) {
          clearInterval(pacingInterval);
          pacingInterval = null;
        }
      } else if (msg.type === "audio" && (msg.chunk || msg.chunks)) {
        if (outSequenceNumber === 0) {
          console.log("Received first audio chunk from Gemini!");
        }
        const rawChunks = Array.isArray(msg.chunks) ? msg.chunks : [msg.chunk];

        for (const chunk of rawChunks) {
          if (
            typeof chunk !== "object" ||
            chunk === null ||
            typeof chunk.dataBase64 !== "string"
          ) {
            continue;
          }
          const mimeType = typeof chunk.mimeType === "string"
            ? chunk.mimeType
            : "";
          const rateMatch = mimeType.match(/rate=([+-]?\d+(?:\.\d+)?)/);
          const inputRate = rateMatch ? Number(rateMatch[1]) : 24000;
          if (
            !Number.isFinite(inputRate) ||
            inputRate < MIN_INPUT_RATE ||
            inputRate > MAX_INPUT_RATE
          ) {
            continue;
          }

          const available = MAX_PCM_BUFFER_SAMPLES - pcmBuffer.length;
          if (available <= 0) break;

          const binary = atob(chunk.dataBase64);
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          const sampleCount = Math.floor(bytes.byteLength / 2);
          if (sampleCount <= 0) continue;

          const inputPcm = new Int16Array(
            bytes.buffer,
            bytes.byteOffset,
            sampleCount,
          );

          let resampled = inputPcm;
          if (inputRate !== 48000) {
            const ratio = 48000 / inputRate;
            const targetLen = Math.min(
              Math.floor(inputPcm.length * ratio),
              available,
            );
            resampled = new Int16Array(targetLen);
            for (let i = 0; i < targetLen; i++) {
              resampled[i] = inputPcm[Math.floor(i / ratio)];
            }
          } else if (resampled.length > available) {
            resampled = resampled.subarray(0, available);
          }

          const newBuffer = new Int16Array(pcmBuffer.length + resampled.length);
          newBuffer.set(pcmBuffer, 0);
          newBuffer.set(resampled, pcmBuffer.length);
          pcmBuffer = newBuffer;
        }

        processPcmBuffer();
      }
    } catch (e) {
      console.error("WebSocket message handling error:", e);
    }
  };

  socket.onerror = (e) => console.error("WebSocket error:", e);
  socket.onclose = () => {
    console.log("WebSocket closed");
    if (pacingInterval) clearInterval(pacingInterval);
    if (mediaReadyFallbackTimer) clearTimeout(mediaReadyFallbackTimer);
    if (pc) {
      try {
        pc.close();
      } catch {
        // ignore close error
      }
    }
  };

  return response;
};

const twilioUpstreamBase = (): string =>
  Deno.env.get("TWILIO_WSS_UPSTREAM") ?? "wss://api.prompt2bot.com";

export type ProxyEndpoint = {
  send: (data: string) => void;
  close: () => void;
  onMessage: (handler: (data: string) => void) => void;
  onClose: (handler: () => void) => void;
  onOpen: (handler: () => void) => void;
};

export const asProxyEndpoint = (ws: WebSocket): ProxyEndpoint => ({
  send: (data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  },
  close: () => {
    if (ws.readyState !== ws.CLOSED) ws.close();
  },
  onMessage: (handler) =>
    ws.addEventListener("message", (event) => handler(String(event.data))),
  onClose: (handler) => ws.addEventListener("close", () => handler()),
  onOpen: (handler) => {
    if (ws.readyState === ws.OPEN) handler();
    else ws.addEventListener("open", () => handler());
  },
});

const maxQueuedWhilePeerPending = 1000;

const forwardInto = (from: ProxyEndpoint, to: ProxyEndpoint) => {
  const queue: string[] = [];
  let toReady = false;
  to.onOpen(() => {
    toReady = true;
    for (const data of queue.splice(0)) to.send(data);
  });
  from.onMessage((data) => {
    if (!toReady) {
      if (queue.length >= maxQueuedWhilePeerPending) queue.shift();
      queue.push(data);
      return;
    }
    to.send(data);
  });
};

export const pipeProxyEndpoints = (
  a: ProxyEndpoint,
  b: ProxyEndpoint,
): void => {
  forwardInto(a, b);
  forwardInto(b, a);
  a.onClose(() => b.close());
  b.onClose(() => a.close());
};

export const asNodeWsProxyEndpoint = (ws: NodeWebSocket): ProxyEndpoint => ({
  send: (data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  },
  close: () => {
    if (ws.readyState !== ws.CLOSED) ws.close();
  },
  onMessage: (handler) =>
    ws.on("message", (data: unknown) => handler(String(data))),
  onClose: (handler) => ws.on("close", () => handler()),
  onOpen: (handler) => {
    if (ws.readyState === ws.OPEN) handler();
    else ws.on("open", () => handler());
  },
});

const proxyTwilioStream = (req: Request): Response => {
  const downstream = Deno.upgradeWebSocket(req);
  const query = new URL(req.url).search;
  const upstream = new NodeWebSocket(
    `${twilioUpstreamBase()}/twilio-voice/stream${query}`,
  );
  const down = asProxyEndpoint(downstream.socket);
  const up = asNodeWsProxyEndpoint(upstream);
  let relayedDown = 0;
  let relayedUp = 0;
  down.onMessage(() => relayedDown++);
  up.onMessage(() => relayedUp++);
  pipeProxyEndpoints(down, up);
  const reportClose = (side: string) =>
    console.log(
      `[twilio-proxy] ${side} closed. downstream->upstream msgs: ${relayedDown}, upstream->downstream msgs: ${relayedUp}`,
    );
  down.onClose(() => {
    reportClose("Downstream");
    up.close();
  });
  up.onClose(() => {
    reportClose("Upstream");
    down.close();
  });
  upstream.on("error", (err: unknown) => {
    console.error("[twilio-proxy] Upstream connection error", err);
    down.close();
  });
  return downstream.response;
};

if (import.meta.main) {
  Deno.serve({ port: 8080 }, handleRequest);
}
