/**
 * The confirmation state machine behind every consequential voice tool.
 *
 * Framework free on purpose: no React, no fetch, no timers of its own. The clock and the
 * executor are injected, so the whole lifecycle is unit testable without a DOM and without
 * waiting in real time. The UI supplies a fetch based executor and drives `tick` from a
 * requestAnimationFrame or interval loop; the tests drive it from a fake clock.
 *
 * Why this exists at all: the ElevenLabs agent may not write. A `propose_*` tool returns
 * immediately with a proposal, the overlay shows the exact fields, the person says yes, and
 * only then does a three second stop window run out and the write happen. The token minted
 * at that moment never leaves this module, so nothing else in the page (and certainly nothing
 * the model says) can reach `execute`.
 *
 * Arming and counting down are two different moments, on purpose. `arm()` only records that
 * the person said yes; it does not start the clock. The agent still has to speak the warning
 * sentence ("filing it now, say stop to cancel") after calling confirm_action, and if the
 * three second window ran from `arm()` itself, the write (and any navigate that follows it)
 * fired while that sentence was still being read out loud, cutting the agent off mid-word.
 * `startCountdown()` is the real start of the window: the caller decides when the person has
 * actually had a chance to hear the warning and say stop, which in practice is "the agent
 * stopped talking" (see VoiceCall's onModeChange) or "the person clicked Confirm now instead
 * of speaking" (ActionOverlay). `maxArmedWaitMs` is a safety net for neither of those ever
 * firing: an armed proposal cannot wait forever for a speech event that never arrives.
 */

/**
 * proposed  the overlay is up, the agent is narrating, nobody has said yes yet
 * armed     the person said yes; the stop window is running
 * executing the window ran out and the write is in flight
 * done      the write returned
 * failed    the write threw
 * stopped   the person said stop before the write started
 * superseded a newer proposal replaced this one
 */
export type ProposalState =
  | 'proposed'
  | 'armed'
  | 'executing'
  | 'done'
  | 'failed'
  | 'stopped'
  | 'superseded';

/** Terminal states: nothing moves a proposal out of one of these. */
const TERMINAL: readonly ProposalState[] = ['done', 'failed', 'stopped', 'superseded'];

export interface PendingAction {
  /** The `propose_*` tool that raised it, for the log and for the overlay title styling. */
  toolName: string;
  /** Overlay title in the shared vocabulary: "Creating ticket", "Closing REQ-0042". */
  title: string;
  /** The exact fields about to be sent, one per line, in the order the agent narrates them. */
  lines: string[];
  method: 'POST' | 'PATCH' | 'PUT';
  /** Same origin API path, already carrying the numeric id where the route needs one. */
  path: string;
  body: unknown;
  /** Where to send the person once the write returns. Undefined means stay put. */
  onSuccessNavigate?: (result: unknown) => string | undefined;
  /** One sentence for the agent to read back, built from what the server actually returned. */
  speakOnSuccess: (result: unknown) => string;
}

export interface ConfirmExecuteMeta {
  /** Minted inside this module at execution time. The routes never see it; it is the proof
   *  that the call came from the overlay and not from a tool call. */
  token: string;
  /** What the person actually said, forwarded to the route as the confirmation header. */
  confirmationText: string;
}

export type ConfirmExecutor = (action: PendingAction, meta: ConfirmExecuteMeta) => Promise<unknown>;

/** Everything the UI may read. Deliberately has no token field. */
export interface ProposalSnapshot {
  proposalId: string;
  state: ProposalState;
  action: PendingAction;
  /** What the person said to arm it, or null while still proposed. */
  confirmationText: string | null;
  armedAt: number | null;
  /** When the stop-window clock actually started (startCountdown, or the maxArmedWaitMs
   *  safety net), or null while armed but still waiting on that signal. */
  countdownStartedAt: number | null;
  /** Derived from countdownStartedAt, not armedAt: null until the countdown is running. */
  stopWindowEndsAt: number | null;
  result: unknown;
  error: string | null;
  paused: boolean;
}

export interface ConfirmStoreOptions {
  now: () => number;
  /** How long "say stop to cancel" stays true once the countdown starts. Three seconds is
   *  gate 0.3's default. */
  stopWindowMs?: number;
  /** If startCountdown is never called this long after arm(), the countdown starts on its
   *  own, so a missing speech event (onModeChange never reaching 'listening') never leaves a
   *  confirmed write parked indefinitely. */
  maxArmedWaitMs?: number;
  execute: ConfirmExecutor;
}

export interface ConfirmStore {
  propose(action: PendingAction): { proposalId: string };
  /** Records the yes. Does NOT start the stop-window clock; see startCountdown. */
  arm(proposalId: string, confirmationText: string): { armedAt: number } | null;
  /** Starts the stop-window clock on an armed proposal that isn't already counting down.
   *  Null if the proposal is unknown, not armed, or already counting down. */
  startCountdown(proposalId: string): { stopWindowEndsAt: number } | null;
  stop(proposalId: string): ProposalSnapshot | null;
  /** Starts execution if the window has run out (auto-starting the countdown first if
   *  maxArmedWaitMs has elapsed with nobody calling startCountdown). Returns the current
   *  snapshot either way. */
  tick(): ProposalSnapshot | null;
  /** tick, then wait for any write it started. Returns the settled snapshot. */
  settle(proposalId?: string): Promise<ProposalSnapshot | null>;
  /** The most recent proposal, whatever state it is in, or null before the first one. */
  getState(): ProposalSnapshot | null;
  getProposal(proposalId: string): ProposalSnapshot | null;
  subscribe(listener: (snapshot: ProposalSnapshot | null) => void): () => void;
  /** Interruption: the person cut in mid narration. The stop window stops counting. */
  pause(): void;
  /** Resuming extends the window by exactly how long the pause lasted. */
  resume(): void;
  /** For the executor only. Every other caller gets false, because it never sees a token. */
  isTokenValid(token: string): boolean;
}

interface ProposalRecord {
  proposalId: string;
  state: ProposalState;
  action: PendingAction;
  confirmationText: string | null;
  armedAt: number | null;
  countdownStartedAt: number | null;
  result: unknown;
  error: string | null;
  /** Never copied into a snapshot. */
  token: string | null;
  inFlight: Promise<void> | null;
}

/** How many settled proposals stay readable by id, so a late `stop` still finds its target. */
const HISTORY_LIMIT = 20;

function randomId(prefix: string): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return `${prefix}_${cryptoRef.randomUUID()}`;
  }
  // Only reachable on a runtime with no Web Crypto. Proposal ids are not secrets; the
  // execution token is, which is why the token path below refuses to fall back silently.
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function mintToken(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = new Uint8Array(32);
    cryptoRef.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('No secure random source available, refusing to mint a confirmation token');
}

function snapshot(record: ProposalRecord, stopWindowMs: number, paused: boolean): ProposalSnapshot {
  return {
    proposalId: record.proposalId,
    state: record.state,
    action: record.action,
    confirmationText: record.confirmationText,
    armedAt: record.armedAt,
    countdownStartedAt: record.countdownStartedAt,
    stopWindowEndsAt: record.countdownStartedAt === null ? null : record.countdownStartedAt + stopWindowMs,
    result: record.result,
    error: record.error,
    paused,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'The write did not go through';
}

export function createConfirmStore(options: ConfirmStoreOptions): ConfirmStore {
  const { now, execute } = options;
  const stopWindowMs = options.stopWindowMs ?? 3000;
  const maxArmedWaitMs = options.maxArmedWaitMs ?? 8000;

  const records = new Map<string, ProposalRecord>();
  const order: string[] = [];
  const listeners = new Set<(snapshot: ProposalSnapshot | null) => void>();
  /** Tokens that have been minted and not yet spent. One entry at a time in practice. */
  const liveTokens = new Set<string>();

  let currentId: string | null = null;
  let pausedAt: number | null = null;

  function current(): ProposalRecord | null {
    return currentId === null ? null : records.get(currentId) ?? null;
  }

  function emit(): void {
    const record = current();
    const value = record === null ? null : snapshot(record, stopWindowMs, pausedAt !== null);
    for (const listener of listeners) listener(value);
  }

  function remember(record: ProposalRecord): void {
    records.set(record.proposalId, record);
    order.push(record.proposalId);
    while (order.length > HISTORY_LIMIT) {
      const oldest = order.shift();
      if (oldest !== undefined && oldest !== currentId) records.delete(oldest);
    }
  }

  function propose(action: PendingAction): { proposalId: string } {
    const active = current();
    // One overlay at a time. A second proposal while one is still open means the agent moved
    // on, so the old one is marked superseded rather than left to execute behind the new veil.
    if (active && (active.state === 'proposed' || active.state === 'armed')) {
      active.state = 'superseded';
      active.token = null;
    }
    pausedAt = null;

    const record: ProposalRecord = {
      proposalId: randomId('prop'),
      state: 'proposed',
      action,
      confirmationText: null,
      armedAt: null,
      countdownStartedAt: null,
      result: null,
      error: null,
      token: null,
      inFlight: null,
    };
    remember(record);
    currentId = record.proposalId;
    emit();
    return { proposalId: record.proposalId };
  }

  /** Records the yes; does not start the stop-window clock (see startCountdown and the
   *  module docstring for why those are two separate moments). */
  function arm(proposalId: string, confirmationText: string): { armedAt: number } | null {
    const record = records.get(proposalId);
    if (!record || record.state !== 'proposed') return null;
    record.state = 'armed';
    record.armedAt = now();
    record.confirmationText = confirmationText;
    pausedAt = null;
    emit();
    return { armedAt: record.armedAt };
  }

  function startCountdown(proposalId: string): { stopWindowEndsAt: number } | null {
    const record = records.get(proposalId);
    if (!record || record.state !== 'armed' || record.countdownStartedAt !== null) return null;
    record.countdownStartedAt = now();
    emit();
    return { stopWindowEndsAt: record.countdownStartedAt + stopWindowMs };
  }

  function stop(proposalId: string): ProposalSnapshot | null {
    const record = records.get(proposalId);
    if (!record) return null;
    // Once the write is in flight, stop is a no-op by design: half a POST is worse than a
    // completed one the person can then cancel or comment on.
    if (record.state === 'proposed' || record.state === 'armed') {
      record.state = 'stopped';
      record.token = null;
      pausedAt = null;
      emit();
    }
    return snapshot(record, stopWindowMs, pausedAt !== null);
  }

  function startExecution(record: ProposalRecord): void {
    const token = mintToken();
    record.token = token;
    liveTokens.add(token);
    record.state = 'executing';
    emit();

    record.inFlight = Promise.resolve()
      .then(() => execute(record.action, { token, confirmationText: record.confirmationText ?? '' }))
      .then((result) => {
        record.result = result;
        record.state = 'done';
      })
      .catch((err: unknown) => {
        record.error = errorMessage(err);
        record.state = 'failed';
      })
      .finally(() => {
        liveTokens.delete(token);
        record.token = null;
        record.inFlight = null;
        emit();
      });
  }

  function tick(): ProposalSnapshot | null {
    const record = current();
    if (!record) return null;
    if (record.state === 'armed' && pausedAt === null) {
      if (
        record.countdownStartedAt === null &&
        record.armedAt !== null &&
        now() >= record.armedAt + maxArmedWaitMs
      ) {
        // Neither "the agent finished speaking" nor "the person clicked Confirm now" ever
        // arrived. Rather than leave a confirmed write parked forever, start the clock now.
        record.countdownStartedAt = now();
        emit();
      }
      if (record.countdownStartedAt !== null && now() >= record.countdownStartedAt + stopWindowMs) {
        startExecution(record);
      }
    }
    return snapshot(record, stopWindowMs, pausedAt !== null);
  }

  async function settle(proposalId?: string): Promise<ProposalSnapshot | null> {
    tick();
    const record = proposalId === undefined ? current() : records.get(proposalId) ?? null;
    if (!record) return null;
    if (record.inFlight) await record.inFlight;
    return snapshot(record, stopWindowMs, pausedAt !== null);
  }

  function pause(): void {
    if (pausedAt !== null) return;
    pausedAt = now();
    emit();
  }

  function resume(): void {
    if (pausedAt === null) return;
    const paused = now() - pausedAt;
    const record = current();
    // Push forward whichever clock is currently live, so the interruption never counts
    // against either the running stop window or the maxArmedWaitMs safety net that would
    // otherwise auto-start it.
    if (record && record.state === 'armed') {
      if (record.countdownStartedAt !== null) {
        record.countdownStartedAt += paused;
      } else if (record.armedAt !== null) {
        record.armedAt += paused;
      }
    }
    pausedAt = null;
    emit();
  }

  return {
    propose,
    arm,
    startCountdown,
    stop,
    tick,
    settle,
    getState: () => {
      const record = current();
      return record === null ? null : snapshot(record, stopWindowMs, pausedAt !== null);
    },
    getProposal: (proposalId: string) => {
      const record = records.get(proposalId);
      return record === undefined ? null : snapshot(record, stopWindowMs, pausedAt !== null);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    pause,
    resume,
    isTokenValid: (token: string) => liveTokens.has(token),
  };
}

export { TERMINAL as TERMINAL_PROPOSAL_STATES };
