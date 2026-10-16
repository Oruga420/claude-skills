/**
 * Fired on window after any mutation that could change the counts shown in the sidebar
 * badge (or other cross-page summaries): requirement create, decision, cancel, comment,
 * and admin purge. AppShell listens for this to keep its badge live without prop drilling.
 */
export const DATA_CHANGED_EVENT = 'app:data-changed';

export function notifyDataChanged(): void {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

/**
 * Fired on window when the assistant (or any other driver) wants an open view to
 * change what it is showing: apply filters, or navigate somewhere. Views subscribe
 * with onViewCommand and decide for themselves which fields apply to them.
 */
export const VIEW_COMMAND_EVENT = 'app:view-command';

export interface ViewCommand {
  filters?: {
    scope?: string;
    status?: string;
    category?: string;
    priority?: string;
    q?: string;
    from?: string;
    to?: string;
    /** '' or 'subtasks', mirroring HistoryFilterValues.include. Home ignores this field. */
    include?: string;
  };
  navigate?: string;
}

export function dispatchViewCommand(cmd: ViewCommand): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ViewCommand>(VIEW_COMMAND_EVENT, { detail: cmd }));
}

export function onViewCommand(handler: (cmd: ViewCommand) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  function listener(event: Event) {
    handler((event as CustomEvent<ViewCommand>).detail);
  }
  window.addEventListener(VIEW_COMMAND_EVENT, listener);
  return () => window.removeEventListener(VIEW_COMMAND_EVENT, listener);
}

/**
 * Fired on window when the assistant (or any other driver) wants to step the guided tour or
 * the welcome card. Tour.tsx subscribes only while it is open; AppShell subscribes always, so
 * it can start the tour from anywhere and dismiss the welcome card while it is showing.
 *
 * Unlike onViewCommand, a handler here reports back whether it actually did something, via the
 * mutable `handled` flag carried in the event detail. window.dispatchEvent runs every listener
 * synchronously before returning, so dispatchTourCommand can read the flag right after and tell
 * a voice tool whether anything was listening, without a second round trip.
 */
export const TOUR_COMMAND_EVENT = 'app:tour-command';

export type TourCommandAction =
  | 'start'
  | 'next'
  | 'previous'
  | 'skip'
  | 'complete'
  | 'welcome_skip'
  | 'welcome_start';

export interface TourCommand {
  action: TourCommandAction;
}

interface TourCommandDetail {
  command: TourCommand;
  /** Starts false. A handler that actually acted on the command leaves it true; one that
   *  declines (wrong action for it, or nothing to act on) returns false and must not flip it. */
  handled: { value: boolean };
}

/** Returns whether some subscribed handler actually acted on the command. */
export function dispatchTourCommand(cmd: TourCommand): boolean {
  if (typeof window === 'undefined') return false;
  const detail: TourCommandDetail = { command: cmd, handled: { value: false } };
  window.dispatchEvent(new CustomEvent<TourCommandDetail>(TOUR_COMMAND_EVENT, { detail }));
  return detail.handled.value;
}

/**
 * `handler` returns true (or nothing) when it acted on the command, false when it declined it.
 * Declining does not unset a sibling handler's true from the same dispatch: several things can
 * be subscribed at once (Tour and AppShell both, while the tour is open) and only one of them
 * needs to have handled it for the caller to know it was not a no-op.
 */
export function onTourCommand(handler: (cmd: TourCommand) => boolean | void): () => void {
  if (typeof window === 'undefined') return () => {};
  function listener(event: Event) {
    const detail = (event as CustomEvent<TourCommandDetail>).detail;
    const acted = handler(detail.command);
    if (acted !== false) detail.handled.value = true;
  }
  window.addEventListener(TOUR_COMMAND_EVENT, listener);
  return () => window.removeEventListener(TOUR_COMMAND_EVENT, listener);
}

// X-App-Source: voice marks a write made through the voice agent
/** Header a write route reads to learn which channel is making the call. */
export const VOICE_SOURCE_HEADER = 'x-app-source';
/** Header carrying the spoken confirmation phrase, when the caller is the voice agent. */
export const VOICE_CONFIRMATION_HEADER = 'x-app-confirmation';

/** Where an events row came from. 'assistant' is /api/chat/confirm and is untouched by this. */
export type EventSource = 'ui' | 'assistant' | 'voice';

/**
 * Reads the two voice-agent headers off an incoming write request.
 *
 * The source is an enum comparison, not a free string: only the literal header value
 * 'voice' becomes source 'voice'. Anything else, including a garbled or spoofed header,
 * falls back to 'ui', so a write can never claim a channel it did not come through.
 * The confirmation phrase is trimmed and capped at 200 characters; missing or blank
 * becomes null rather than an empty string, so the events row reads as "no confirmation"
 * either way.
 */
export function readWriteSource(req: Request): { source: EventSource; confirmation: string | null } {
  const sourceHeader = req.headers.get(VOICE_SOURCE_HEADER);
  const source: EventSource = sourceHeader === 'voice' ? 'voice' : 'ui';

  const confirmationHeader = req.headers.get(VOICE_CONFIRMATION_HEADER);
  const trimmed = confirmationHeader?.trim().slice(0, 200) ?? '';
  const confirmation = trimmed.length > 0 ? trimmed : null;

  return { source, confirmation };
}
