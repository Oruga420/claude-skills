'use client';

import { useEffect, useRef, useState } from 'react';
import { getConfirmStore } from '@/lib/voice/callStore';
import type { ProposalSnapshot } from '@/lib/voice/tools/types';
import styles from './voice.module.css';

/** How often the countdown re-renders and drives confirm.tick(), which is what actually
 *  starts execution once the stop window has run out (see confirm.ts's own docstring: the
 *  UI supplies the interval, the store supplies the clock). */
const TICK_MS = 200;
/** "Done: REQ-0060" stays up this long before the overlay lets go, so the person sees the
 *  write actually landed before the page underneath (already navigated by callStore's
 *  execute, via dispatchViewCommand) becomes visible. */
const DONE_HOLD_MS = 1100;
/** A failure needs longer on screen than a success flash, since there is nothing else on
 *  the page that will explain what happened. */
const FAILED_HOLD_MS = 2200;

const FOCUSABLE_SELECTOR = 'button, [href], input, [tabindex]:not([tabindex="-1"])';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Best-effort "what got filed" label for the done panel. Every write route this loop touches
 * (src/app/api/requirements/**) answers `{ requirement: { code, ... } }` (verified against
 * the status route), so that is the first thing tried; the action's own title is what the
 * person already saw narrated, so it is a safe fallback for any route that does not.
 */
function extractDoneLabel(title: string, result: unknown): string {
  if (isRecord(result) && isRecord(result.requirement) && typeof result.requirement.code === 'string') {
    return result.requirement.code;
  }
  if (isRecord(result) && typeof result.code === 'string') {
    return result.code;
  }
  return title;
}

const OPEN_STATES: ReadonlySet<ProposalSnapshot['state']> = new Set([
  'proposed',
  'armed',
  'executing',
  'done',
  'failed',
]);

/**
 * The full veil that shows exactly what a voice-proposed write is about to do, counts down
 * the stop window, and holds the result up for one beat once it lands. Takes no props: it
 * reads the one shared confirm store (see src/lib/voice/callStore.ts for why that is a
 * singleton rather than something passed down from VoiceCall).
 */
export function ActionOverlay() {
  const store = getConfirmStore();
  const [snapshot, setSnapshot] = useState<ProposalSnapshot | null>(() => store.getState());
  const [dismissedProposalId, setDismissedProposalId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => store.subscribe(setSnapshot), [store]);

  const visible =
    snapshot !== null && snapshot.proposalId !== dismissedProposalId && OPEN_STATES.has(snapshot.state);

  // Countdown + the only place anything drives confirm.tick(): once the window is up this
  // is what flips 'armed' to 'executing' and fires the real write.
  useEffect(() => {
    if (!snapshot || snapshot.state !== 'armed') return;
    const id = setInterval(() => {
      setNowMs(Date.now());
      store.tick();
    }, TICK_MS);
    return () => clearInterval(id);
    // Depends on the proposalId/state pair rather than the whole snapshot object on purpose:
    // the object is a fresh reference on every emit (including the nowMs-unrelated fields this
    // effect does not care about), and re-arming the same interval on every emit would both
    // restart its 200ms cadence and be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.proposalId, snapshot?.state, store]);

  // Hold the terminal panel up for one beat, then let this proposal go. A later proposal
  // (a different proposalId) is unaffected, so this never suppresses the next call's overlay.
  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.state !== 'done' && snapshot.state !== 'failed') return;
    const holdMs = snapshot.state === 'done' ? DONE_HOLD_MS : FAILED_HOLD_MS;
    const id = setTimeout(() => setDismissedProposalId(snapshot.proposalId), holdMs);
    return () => clearTimeout(id);
    // Same reasoning as the effect above: keyed on proposalId/state, not the whole object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.proposalId, snapshot?.state]);

  // Focus trap: move focus in when the veil appears, cycle Tab within the panel, return
  // focus to whatever had it once the veil goes away. Escape stops the proposal outright.
  useEffect(() => {
    if (!visible) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (snapshot) store.stop(snapshot.proposalId);
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled'),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || !snapshot) return null;

  const { action, state } = snapshot;
  const seconds =
    snapshot.stopWindowEndsAt === null ? 0 : Math.max(0, Math.ceil((snapshot.stopWindowEndsAt - nowMs) / 1000));

  return (
    <div className={styles.overlay} role="presentation" data-testid="action-overlay">
      <div
        ref={panelRef}
        className={styles.panel}
        role="alertdialog"
        aria-modal="true"
        aria-label={action.title}
      >
        <div className={styles.panelTitle}>{action.title}</div>

        <div className={styles.lineList}>
          {action.lines.map((line, i) => (
            <div key={`${snapshot.proposalId}-${i}`} className={styles.line} style={{ animationDelay: `${i * 140}ms` }}>
              {line}
            </div>
          ))}
        </div>

        <div aria-live="polite">
          {/* Only shown once the countdown is actually running (see confirm.ts's
              startCountdown): while armed but still waiting on the agent to finish speaking
              (or the person to click Confirm now), the lines and the Stop hint below already
              say everything true at that moment. A "Filing in 3, 2, 1" here before the clock
              started would be a countdown to nothing. */}
          {state === 'armed' && snapshot.countdownStartedAt !== null && (
            <div className={styles.countdown}>Filing in {seconds}...</div>
          )}
          {state === 'executing' && <div className={styles.countdown}>Filing...</div>}
          {state === 'done' && (
            <div className={styles.doneText}>Done: {extractDoneLabel(action.title, snapshot.result)}</div>
          )}
          {state === 'failed' && (
            <div className={styles.failedText}>{snapshot.error ?? 'The write did not go through.'}</div>
          )}
        </div>

        {(state === 'proposed' || state === 'armed') && (
          <div className={styles.stopHint}>Say stop to cancel.</div>
        )}

        <div className={styles.panelFooter}>
          {(state === 'proposed' || state === 'armed') && (
            <button
              type="button"
              className="btn btn-danger-outline btn-sm"
              onClick={() => store.stop(snapshot.proposalId)}
            >
              Stop
            </button>
          )}
          {state === 'proposed' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                // A click has no speech to wait for, so the window starts immediately rather
                // than waiting on an onModeChange that a text-only confirmation never gets.
                store.arm(snapshot.proposalId, 'clicked confirm');
                store.startCountdown(snapshot.proposalId);
              }}
            >
              Confirm now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
