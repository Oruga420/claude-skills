'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { getConfirmStore } from '@/lib/voice/callStore';
import { installWebMcp } from '@/lib/voice/webmcp';
import { toolsForRole, runTool } from '@/lib/voice/tools/registry';
import {
  ApiError,
  VOICE_SOURCE_HEADER,
  VOICE_SOURCE_VALUE,
  VOICE_CONFIRMATION_HEADER,
  type ToolContext,
  type VoiceUser,
} from '@/lib/voice/tools/types';
import { dispatchViewCommand, notifyDataChanged } from '@/lib/events';
import { Orb, type OrbMode } from './Orb';
import styles from './voice.module.css';

export interface VoiceCallProps {
  user: VoiceUser;
}

/** No user speech (per the SDK's mode, the closest proxy available; see the note near
 *  armIdleTimer) or tool call for this long ends the call on its own. */
const IDLE_TIMEOUT_MS = 90_000;
/** Absolute ceiling on a single call, independent of activity. */
const HARD_CAP_MS = 15 * 60 * 1000;

interface TokenResponseData {
  conversation_token: string;
  conversation_id: string;
  dynamic_variables: Record<string, string | number | boolean>;
  expires_hint_minutes: number;
}

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

type CallStatus = 'idle' | 'connecting' | 'reconnecting' | 'connected' | 'ended';

function statusLabel(callStatus: CallStatus, mode: OrbMode): string {
  if (callStatus === 'connecting') return 'Connecting';
  if (callStatus === 'reconnecting') return 'Reconnecting';
  if (callStatus === 'ended') return 'Ended';
  if (callStatus === 'connected') return mode === 'speaking' ? 'Speaking' : 'Listening';
  return 'Connecting';
}

/** What the popover shows (`text`, plain English) versus what only a `title` attribute
 *  carries (`title`, the raw SDK/DOMException text) for debugging without ever putting a
 *  "NotSupportedError" or similar string in front of the person on the call. */
interface FriendlyError {
  text: string;
  title: string;
}

/**
 * Classifies a raw SDK error (from onError, or a getUserMedia rejection surfaced the same
 * way) into one of four plain-English buckets. Matches on the DOMException name a browser's
 * getUserMedia rejects with (NotSupportedError, NotAllowedError) and on connection-shaped
 * failure text, in that order, so a permission refusal is never mistaken for a network issue.
 * Anything unrecognized falls through to the generic notice rather than ever showing raw
 * error text as the visible copy.
 */
function classifyVoiceError(raw: string): FriendlyError {
  const lower = raw.toLowerCase();

  if (lower.includes('notallowederror') || lower.includes('permission denied') || lower.includes('permission dismissed')) {
    return { text: 'Microphone permission was denied. Allow it in the browser and try again.', title: raw };
  }
  if (
    lower.includes('notsupportederror') ||
    lower.includes('notfounderror') ||
    lower.includes('mediadevices') ||
    lower.includes('getusermedia') ||
    lower.includes('not supported')
  ) {
    return { text: 'This browser cannot open a microphone here. Use the text field below.', title: raw };
  }
  if (
    lower.includes('connection') ||
    lower.includes('network') ||
    lower.includes('websocket') ||
    lower.includes('webrtc') ||
    lower.includes('timeout') ||
    lower.includes('disconnect')
  ) {
    return { text: 'Could not reach the voice service. Try again or type below.', title: raw };
  }
  return { text: 'Voice is unavailable right now. You can type below.', title: raw };
}

/** True when this browser has no working mic API at all (routinely the case in the headless
 *  Chromium the walkthrough script drives). Checked up front, before ever asking the SDK to
 *  open a session, so the popover shows the plain-English notice immediately instead of
 *  waiting on a getUserMedia rejection to round-trip through onError first. */
function hasMicrophoneSupport(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** POSTs the token route directly (not the api() helper) because the popover needs to tell
 *  503 (not configured), 401 and 429 apart, and api() collapses every failure into one Error
 *  with no status code. */
async function requestVoiceToken(): Promise<
  { ok: true; data: TokenResponseData } | { ok: false; status: number; message: string }
> {
  let res: Response;
  try {
    res = await fetch('/api/voice/token', { method: 'POST' });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the voice service. Try again or type below.' };
  }

  let body: Envelope<TokenResponseData>;
  try {
    body = await res.json();
  } catch {
    return { ok: false, status: res.status, message: 'Unexpected server response.' };
  }

  if (!body.success || !body.data) {
    return { ok: false, status: res.status, message: body.error ?? 'Could not start the voice session.' };
  }
  return { ok: true, data: body.data };
}

/** Phone glyphs for the head's icon buttons: deliberately plain strokes, no fill, matching
 *  the sidebar's icon style rather than a filled "material" glyph. */
function EndCallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 14c4-4 12-4 16 0l-2.2 3.3a1.4 1.4 0 01-1.9.4l-2-1.2a1.4 1.4 0 00-1.6.1l-1.3 1a10 10 0 01-4-4l1-1.3a1.4 1.4 0 00.1-1.6l-1.2-2A1.4 1.4 0 016.2 8.8L4 14z" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 5l14 14" />
      <path d="M19 5L5 19" />
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0" />
      <path d="M12 18v3" />
      {muted && <path d="M3 3l18 18" />}
    </svg>
  );
}

function VoiceCallInner({ user }: VoiceCallProps) {
  const [open, setOpen] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<FriendlyError | null>(null);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'agent'; text: string } | null>(null);
  const [textDraft, setTextDraft] = useState('');

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set right before a deliberate end (button, idle, hard cap) so onDisconnect knows not to
   *  treat it as a dropped connection worth retrying. */
  const manualEndRef = useRef(false);
  /** Interruption/resume: see onInterruption below for why this needs a two-step latch
   *  rather than resuming on the very next mode change. */
  const interruptedRef = useRef(false);
  const sawSpeakingSinceInterruptRef = useRef(false);

  const confirmStore = getConfirmStore();

  /** Same-origin fetch every voice tool's execute(ctx) uses for reads (and for anything
   *  that writes through ctx.fetchJson rather than through the confirm store's own executor).
   *  Throws ApiError (status-carrying) rather than the plain Error api() throws, because
   *  ToolContext.fetchJson's contract (src/lib/voice/tools/types.ts) says tools map a status
   *  onto a spoken sentence. The two voice headers ride along only when there is a live
   *  confirmation on the store, so an ordinary read never claims to be a confirmed write. */
  const fetchJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const confirmationText = confirmStore.getState()?.confirmationText ?? null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (confirmationText) {
      headers[VOICE_SOURCE_HEADER] = VOICE_SOURCE_VALUE;
      headers[VOICE_CONFIRMATION_HEADER] = confirmationText;
    }

    const res = await fetch(path, { ...init, headers });
    let body: Envelope<T>;
    try {
      body = await res.json();
    } catch {
      throw new ApiError('Unexpected server response', res.status);
    }
    if (!body.success) {
      throw new ApiError(body.error ?? 'Request failed', res.status);
    }
    return body.data as T;
  }, [confirmStore]);

  const ctx: ToolContext = useMemo(
    () => ({
      user,
      fetchJson,
      dispatchViewCommand,
      notifyDataChanged,
      confirm: confirmStore,
      now: () => Date.now(),
    }),
    [user, fetchJson, confirmStore],
  );

  const tools = useMemo(() => toolsForRole(user.role), [user.role]);

  // A secondary, best-effort discovery surface for the same tools; see webmcp.ts for why
  // this never touches the ElevenLabs session itself.
  useEffect(() => installWebMcp(tools, ctx), [tools, ctx]);

  function clearIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }

  function clearHardCapTimer() {
    if (hardCapTimerRef.current) clearTimeout(hardCapTimerRef.current);
    hardCapTimerRef.current = null;
  }

  const endCall = useCallback(
    (nextStatus: CallStatus) => {
      manualEndRef.current = true;
      clearIdleTimer();
      clearHardCapTimer();
      conversation.endSession();
      setCallStatus(nextStatus);
    },
    // conversation is defined below with useConversation; declared here via a ref-stable
    // wrapper is unnecessary because useConversation's endSession is itself referentially
    // stable across renders (see the ConversationControls provider: "stable action
    // references... will never cause re-renders").
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** No signal exists in the SDK for "the user started talking" distinct from the agent's
   *  own speaking/listening mode (Callbacks has no onUserSpeechStarted); onModeChange
   *  flipping to 'listening' is the closest available proxy, since that is the SDK telling
   *  us it is now the person's turn. A tool call resets it too, per the spec, since a tool
   *  call only happens because the person asked for something. */
  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      endCall('ended');
    }, IDLE_TIMEOUT_MS);
  }, [endCall]);

  const clientTools = useMemo(() => {
    const map: Record<string, (parameters: unknown) => Promise<string>> = {};
    for (const tool of tools) {
      map[tool.name] = async (parameters: unknown) => {
        armIdleTimer();
        const result = await runTool(tool.name, parameters, ctx);
        // Re-armed on completion too (not just at the start of the call): a tool such as
        // navigate must never end or reset the session itself, it only pushes the idle
        // deadline out from whenever it actually finished, so the agent stays available for
        // whatever the person asks next.
        armIdleTimer();
        // ClientToolsConfig (node_modules/@elevenlabs/client/dist/BaseConversation.d.ts)
        // accepts string | number | void, and does not serialize the return value the way
        // the WebMCP polyfill does for us (see webmcp.ts); ToolResult is always an object,
        // so this always stringifies, but the typeof check is kept for parity with a tool
        // that ever returns a bare string.
        return typeof result === 'string' ? result : JSON.stringify(result);
      };
    }
    return map;
  }, [tools, ctx, armIdleTimer]);

  const conversation = useConversation({
    onConnect: () => {
      manualEndRef.current = false;
      setCallStatus('connected');
      setErrorNotice(null);
      armIdleTimer();
    },
    onDisconnect: (details) => {
      clearIdleTimer();
      clearHardCapTimer();
      const wasManual = manualEndRef.current;
      manualEndRef.current = false;
      if (!wasManual && details.reason === 'error') {
        // Not a deliberate end (button, Escape, idle, hard cap): show Reconnecting and let
        // the person choose to try again (the "Call again" control below), rather than
        // silently retrying on their behalf.
        setCallStatus('reconnecting');
        return;
      }
      setCallStatus('ended');
    },
    onError: (message) => {
      setErrorNotice(classifyVoiceError(message));
    },
    onMessage: ({ message, role }) => {
      setTranscript({ role, text: message });
    },
    onModeChange: ({ mode }) => {
      // Either side talking is activity: a natural back-and-forth (agent speaking, person
      // listening, person speaking) must never trip the idle timer mid-conversation, and a
      // finished tool call already re-arms it separately (see clientTools below).
      armIdleTimer();
      if (interruptedRef.current) {
        if (mode === 'speaking') {
          sawSpeakingSinceInterruptRef.current = true;
        } else if (mode === 'listening' && sawSpeakingSinceInterruptRef.current) {
          confirmStore.resume();
          interruptedRef.current = false;
          sawSpeakingSinceInterruptRef.current = false;
        }
      }
      // The agent just finished talking (its turn ended, the person's turn started): if a
      // proposal is armed and still waiting to hear that, this is the actual "say stop" window
      // starting, not confirm_action's own return, which happens before the warning sentence
      // has even been spoken.
      if (mode === 'listening') {
        const state = confirmStore.getState();
        if (state && state.state === 'armed' && state.countdownStartedAt === null) {
          confirmStore.startCountdown(state.proposalId);
        }
      }
    },
    onInterruption: () => {
      // The person cut in mid narration of a pending action: freeze the stop window so the
      // three seconds do not run out while the agent is still explaining what changed, then
      // resume it once the agent has answered (see onModeChange above).
      confirmStore.pause();
      interruptedRef.current = true;
      sawSpeakingSinceInterruptRef.current = false;
    },
  });

  const beginCall = useCallback(async () => {
    setConfigNotice(null);
    setErrorNotice(null);

    // Checked up front rather than waiting on a getUserMedia rejection to round-trip through
    // onError: a browser with no mic API at all (routinely the headless Chromium the
    // walkthrough script drives) can say so immediately, with no token spent and no session
    // attempted.
    if (!hasMicrophoneSupport()) {
      setErrorNotice(classifyVoiceError('NotSupportedError: no mediaDevices.getUserMedia in this browser'));
      setCallStatus('ended');
      return;
    }

    setCallStatus((prev) => (prev === 'idle' || prev === 'ended' ? 'connecting' : 'reconnecting'));

    const result = await requestVoiceToken();
    if (!result.ok) {
      if (result.status === 503) {
        setConfigNotice('Voice is not set up yet. Ask an admin to add the ElevenLabs agent.');
      } else {
        // Already a specific, human-authored message from the route (401's "Authentication
        // required", 429's rate-limit text, or the connection-failure text above), not a raw
        // SDK error name, so it goes straight through rather than being reclassified.
        setErrorNotice({ text: result.message, title: result.message });
      }
      setCallStatus('ended');
      return;
    }

    manualEndRef.current = false;
    hardCapTimerRef.current = setTimeout(() => endCall('ended'), HARD_CAP_MS);

    conversation.startSession({
      conversationToken: result.data.conversation_token,
      connectionType: 'webrtc',
      dynamicVariables: result.data.dynamic_variables,
      clientTools,
    });
    // startSession (the useConversation convenience hook's version) returns void, not a
    // Promise: connection outcome arrives through onConnect/onError/onDisconnect above, not
    // through this call resolving or rejecting.
  }, [conversation, clientTools, endCall]);

  function handleTogglePopover() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && (callStatus === 'idle' || callStatus === 'ended')) {
      void beginCall();
    }
  }

  function handleEndCall() {
    endCall('ended');
  }

  /** The X in the head: unlike the End call control (which leaves the popover open on
   *  "Ended" so the person sees the call actually stopped), this closes it too. */
  function handleCloseAndEnd() {
    endCall('ended');
    setOpen(false);
  }

  function handleToggleMute() {
    conversation.setMuted(!conversation.isMuted);
  }

  function handleSendText(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = textDraft.trim();
    if (!text || callStatus !== 'connected') return;
    conversation.sendUserMessage(text);
    setTranscript({ role: 'user', text });
    setTextDraft('');
    armIdleTimer();
  }

  // Hard stop on tab close, best effort: a fetch-based endpoint could be more reliable
  // (sendBeacon), but the session lives entirely on ElevenLabs' side of a WebRTC connection
  // that the browser is about to tear down anyway, so there is nothing left to flush.
  useEffect(() => {
    function onBeforeUnload() {
      if (callStatus === 'connected' || callStatus === 'connecting' || callStatus === 'reconnecting') {
        manualEndRef.current = true;
        conversation.endSession();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus]);

  useEffect(
    () => () => {
      clearIdleTimer();
      clearHardCapTimer();
    },
    [],
  );

  // Escape ends the call whenever the popover is open, matching the End call control rather
  // than also closing the popover (so the person still sees the call actually stopped).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (callStatus === 'idle' || callStatus === 'ended') return;
      e.preventDefault();
      handleEndCall();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, callStatus]);

  const orbMode: OrbMode =
    callStatus === 'connecting'
      ? 'connecting'
      : callStatus === 'reconnecting'
        ? 'reconnecting'
        : callStatus === 'ended'
          ? 'ended'
          : conversation.mode === 'speaking'
            ? 'speaking'
            : 'listening';

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        data-tour="voice-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleTogglePopover}
      >
        <span className={styles.launcherDot} aria-hidden="true" />
        Call the voice agent
      </button>

      {open && (
        <div
          className={styles.popover}
          role="dialog"
          aria-modal="false"
          aria-label="Voice agent"
          data-testid="voice-popover"
        >
          <div className={styles.popoverHead}>
            <span className={styles.popoverTitle}>Voice agent</span>
            <div className={styles.headActions}>
              <button
                type="button"
                className={callStatus === 'connected' && conversation.isMuted ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton}
                aria-label={conversation.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={conversation.isMuted}
                disabled={callStatus !== 'connected'}
                onClick={handleToggleMute}
              >
                <MicIcon muted={conversation.isMuted} />
              </button>
              {/* Text, not only an icon: the icon-only control was not found in the sandbox. */}
              <button
                type="button"
                className="btn btn-on-dark btn-sm"
                aria-label="End call"
                data-testid="voice-end"
                disabled={callStatus === 'idle' || callStatus === 'ended'}
                onClick={handleEndCall}
              >
                <EndCallIcon />
                End call
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close"
                title="End call and close"
                onClick={handleCloseAndEnd}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className={styles.body}>
            {configNotice ? (
              <div className={styles.configNotice}>{configNotice}</div>
            ) : (
              <>
                <Orb mode={orbMode} getOutputVolume={conversation.getOutputVolume} statusLabel={statusLabel(callStatus, orbMode)} />
                {callStatus === 'reconnecting' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    data-testid="voice-call-again"
                    onClick={() => void beginCall()}
                  >
                    Call again
                  </button>
                )}
                {errorNotice && (
                  <div className={styles.errorNotice} title={errorNotice.title}>
                    {errorNotice.text}
                  </div>
                )}
                <div className={styles.transcript} data-testid="voice-transcript">
                  {transcript ? transcript.text : ''}
                </div>
                <form className={styles.textRow} onSubmit={handleSendText}>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="Type instead"
                    value={textDraft}
                    disabled={callStatus !== 'connected'}
                    onChange={(e) => setTextDraft(e.target.value)}
                    aria-label="Type a message to the voice agent"
                  />
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The corner launcher and popover for this app's voice agent. Wraps its content in
 * ConversationProvider because useConversation (node_modules/@elevenlabs/react) must be
 * called inside one; the provider itself does nothing network-visible until startSession is
 * called, so mounting it unconditionally in VoiceProvider (src/app/layout.tsx) costs nothing
 * while the popover is closed, and it is never remounted by a client-side navigation because
 * the layout, unlike each page's own AppShell, is not re-rendered by routing.
 */
export function VoiceCall({ user }: VoiceCallProps) {
  return (
    <ConversationProvider>
      <VoiceCallInner user={user} />
    </ConversationProvider>
  );
}
