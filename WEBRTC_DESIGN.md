# Voice Chat via WebRTC Design

## 1. Objective

Enable direct peer-to-peer voice chat in Alice & Bot using WebRTC. The signaling
will be routed through the existing encrypted messaging infrastructure
(InstantDB), while the actual audio stream will flow directly between the peers.

## 2. Protocol Changes

We will introduce a new `CallMessage` type to `InternalMessage` and
`DecipheredMessage` in `protocol/src/clientApi.ts`.

```typescript
type CallAction =
  | "offer" // Initiates the call, contains SDP offer
  | "answer" // Accepts the call, contains SDP answer
  | "ice_candidate" // Network routing info for WebRTC
  | "reject" // Call declined by receiver
  | "end"; // Call ended (hang up)

type CallMessage = {
  type: "call";
  callId: string; // Grouping ID to track the lifecycle of the call
  action: CallAction;
  payload?: any; // RTCSessionDescriptionInit or RTCIceCandidateInit
};
```

## 3. Call Lifecycle & State Machine

### Initiating a Call (User A)

1. User A clicks the "Call" button in the conversation UI.
2. App requests microphone access (`navigator.mediaDevices.getUserMedia`).
3. App instantiates `RTCPeerConnection` and adds the local audio track.
4. App generates a WebRTC Offer, sets local description, and sends a `call`
   message (`action: "offer"`).
5. App listens for `icecandidate` events and sends them as
   `action: "ice_candidate"` messages.

### Receiving a Call (User B)

1. User B receives the `offer` message.
2. If B is currently active, a "Ringing..." modal/banner is displayed. (A push
   notification could also be triggered, but we'll focus on in-app first).
3. If B clicks **Accept**:
   - B requests microphone access.
   - B instantiates `RTCPeerConnection`, adds local track.
   - B applies A's SDP offer as the remote description.
   - B generates an Answer, sets local description, and sends a `call` message
     (`action: "answer"`).
   - B listens for and sends `icecandidate` events.
4. If B clicks **Reject**:
   - B sends a `call` message (`action: "reject"`).

### Connecting

- A receives B's `answer` and sets it as the remote description.
- Both A and B receive each other's `ice_candidate` messages and add them via
  `addIceCandidate()`.
- The `RTCPeerConnection` triggers `ontrack` when the remote stream arrives,
  which is played through a hidden `<audio autoplay>` element.

### Ending a Call

- Either user clicks "Hang Up", sending a `call` message (`action: "end"`).
- Both sides close their `RTCPeerConnection`, stop media tracks, and remove the
  `<audio>` element.

## 4. UI Representation

Since call signaling uses the standard message channel, the UI can render the
call state directly in the chat feed:

- **Calling...** -> Rendered when only an `offer` exists.
- **Missed Call** / **Rejected** -> Rendered if `reject` is received, or if
  `offer` is old and unacknowledged.
- **Active Call** -> Rendered when `answer` is received and call hasn't ended.
  Shows an active timer and a "Hang up" button.
- **Call Ended** -> Rendered when `end` is received, displaying the duration.

_Note: ICE candidates are filtered out from the visible chat UI to prevent spam,
but are processed by a call manager hook._

## 5. Integration with ai-utils

In the future, the bot (e.g., Gemini Live via `ai-utils`) can run a headless
WebRTC client (using `wrtc` or similar in Node/Deno) to answer these calls
directly, using its own audio session stream.
