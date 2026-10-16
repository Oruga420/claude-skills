/**
 * The one confirm store the whole call UI shares.
 *
 * VoiceCall (the launcher and popover) and ActionOverlay (the full veil that shows a proposal
 * and counts down) are mounted as siblings inside AppShell, not nested, and ActionOverlay is
 * meant to be dropped in with no props (see the shell integration task). A React context would
 * need a provider wrapping both, which is one more component than the file list called for, so
 * this is a plain module-level singleton instead: lazily built on first use, reused for the
 * life of the page's JS, which is exactly the lifetime AppShell needs (mounted once and kept
 * across client-side navigations).
 *
 * The store's `execute` here is the ONE place a voice-proposed write actually reaches the
 * network. It does not take ToolContext or the signed-in user, because by the time a proposal
 * is armed and its window has run out, PendingAction already carries everything the write
 * needs (method, path, body); the confirm store hands `execute` the confirmation text as a
 * call argument (`meta.confirmationText`), so there is no need to reach back into ToolContext
 * for it and no circular dependency between "the store needs a user" and "the user needs a
 * store."
 */

import { createConfirmStore, type ConfirmStore, type PendingAction, type ProposalSnapshot } from './confirm';
import { VOICE_SOURCE_HEADER, VOICE_SOURCE_VALUE, VOICE_CONFIRMATION_HEADER } from './tools/types';
import { notifyDataChanged, dispatchViewCommand } from '@/lib/events';

interface WriteEnvelope {
  success: boolean;
  data: unknown;
  error: string | null;
}

/**
 * Dev-only escape hatch onto the shared confirm store, so a human (or the walkthrough script,
 * scripts/voice-walkthrough.py) can raise and drive the ActionOverlay without a live ElevenLabs
 * connection. Mirrors the four store methods the overlay itself uses; never assigned when
 * `installDebugHook` decides this is a production build (see there for why both NODE_ENV and
 * `window` are checked at runtime, not left to bundler dead-code elimination alone).
 */
interface VoiceDebugHook {
  propose: (action: PendingAction) => { proposalId: string };
  arm: (proposalId: string, confirmationText: string) => { armedAt: number } | null;
  startCountdown: (proposalId: string) => { stopWindowEndsAt: number } | null;
  stop: (proposalId: string) => ProposalSnapshot | null;
  getState: () => ProposalSnapshot | null;
}

declare global {
  interface Window {
    __voiceDebugHook?: VoiceDebugHook;
  }
}

let store: ConfirmStore | null = null;

export function getConfirmStore(): ConfirmStore {
  if (store) return store;

  store = createConfirmStore({
    now: () => Date.now(),
    execute: async (action, meta) => {
      const res = await fetch(action.path, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          [VOICE_SOURCE_HEADER]: VOICE_SOURCE_VALUE,
          [VOICE_CONFIRMATION_HEADER]: meta.confirmationText,
        },
        body: action.body === undefined ? undefined : JSON.stringify(action.body),
      });

      let body: WriteEnvelope;
      try {
        body = await res.json();
      } catch {
        throw new Error('Unexpected server response');
      }
      if (!body.success) {
        throw new Error(body.error ?? 'Request failed');
      }

      // Same two effects a UI-driven write already causes: the sidebar badge and any open
      // list refresh, and, for a write that hands back where to go, the page follows there.
      notifyDataChanged();
      const navigate = action.onSuccessNavigate?.(body.data);
      if (navigate) dispatchViewCommand({ navigate });

      return body.data;
    },
  });

  installDebugHook(store);

  return store;
}

/**
 * Wires window.__voiceDebugHook for local/dev/sandbox builds only. `process.env.NODE_ENV` is
 * inlined by Next's bundler, so a production build should already tree-shake the branch below;
 * the explicit check is kept anyway because that inlining is a build-config fact, not a
 * language guarantee, and this hook can call `execute`, the one place a write actually reaches
 * the network (see the module docstring above). `typeof window === 'undefined'` keeps it off
 * the server render as a second, independent guard.
 */
function installDebugHook(confirmStore: ConfirmStore): void {
  if (process.env.NODE_ENV === 'production') return;
  if (typeof window === 'undefined') return;

  window.__voiceDebugHook = {
    propose: (action: PendingAction) => confirmStore.propose(action),
    arm: (proposalId: string, confirmationText: string) => confirmStore.arm(proposalId, confirmationText),
    startCountdown: (proposalId: string) => confirmStore.startCountdown(proposalId),
    stop: (proposalId: string) => confirmStore.stop(proposalId),
    getState: () => confirmStore.getState(),
  };
}
