import { describe, it, expect, vi } from 'vitest';
import {
  createConfirmStore,
  type ConfirmExecuteMeta,
  type ConfirmStore,
  type PendingAction,
  type ProposalSnapshot,
} from '@/lib/voice/confirm';

/**
 * The clock is injected, so nothing here waits in real time. Every "three seconds later" is
 * a number going up, which is the only way the stop window is testable at all.
 */
function fakeClock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function action(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    toolName: 'propose_create_requirement',
    title: 'Creating ticket',
    lines: ['Category: Software', 'Priority: High'],
    method: 'POST',
    path: '/api/requirements',
    body: { description: 'I need a software license', category: 'software', priority: 'high' },
    speakOnSuccess: () => 'Filed REQ-0060.',
    ...overrides,
  };
}

interface Harness {
  store: ConfirmStore;
  clock: ReturnType<typeof fakeClock>;
  calls: Array<{ action: PendingAction; meta: ConfirmExecuteMeta }>;
}

function harness(opts: { result?: unknown; fail?: string; maxArmedWaitMs?: number } = {}): Harness {
  const clock = fakeClock();
  const calls: Array<{ action: PendingAction; meta: ConfirmExecuteMeta }> = [];
  const store = createConfirmStore({
    now: clock.now,
    stopWindowMs: 3000,
    maxArmedWaitMs: opts.maxArmedWaitMs,
    execute: async (a, meta) => {
      calls.push({ action: a, meta });
      if (opts.fail) throw new Error(opts.fail);
      return opts.result ?? { requirement: { id: 60, code: 'REQ-0060' } };
    },
  });
  return { store, clock, calls };
}

describe('confirm store, proposing', () => {
  it('starts with no state at all', () => {
    const { store } = harness();
    expect(store.getState()).toBeNull();
  });

  it('propose returns an id and leaves the proposal in proposed', () => {
    const { store } = harness();
    const { proposalId } = store.propose(action());
    expect(proposalId).toBeTruthy();
    expect(store.getState()?.state).toBe('proposed');
    expect(store.getState()?.proposalId).toBe(proposalId);
  });

  it('carries the narrated lines through to the snapshot', () => {
    const { store } = harness();
    store.propose(action());
    expect(store.getState()?.action.lines).toEqual(['Category: Software', 'Priority: High']);
  });

  it('a second propose supersedes the first', () => {
    const { store } = harness();
    const first = store.propose(action()).proposalId;
    const second = store.propose(action({ title: 'Closing REQ-0042' })).proposalId;

    expect(first).not.toBe(second);
    expect(store.getProposal(first)?.state).toBe('superseded');
    expect(store.getState()?.proposalId).toBe(second);
    expect(store.getState()?.state).toBe('proposed');
  });

  it('a superseded proposal can no longer be armed', () => {
    const { store } = harness();
    const first = store.propose(action()).proposalId;
    store.propose(action());
    expect(store.arm(first, 'yes')).toBeNull();
  });

  it('notifies subscribers on every transition, including startCountdown', () => {
    const { store, clock } = harness();
    const seen: Array<ProposalSnapshot | null> = [];
    const unsubscribe = store.subscribe((s) => seen.push(s));

    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes go ahead');
    store.startCountdown(proposalId);
    clock.advance(3000);
    store.tick();

    // Still 'armed' when startCountdown runs (only countdownStartedAt changed), which is why
    // 'armed' appears twice: once from arm(), once from startCountdown().
    expect(seen.map((s) => s?.state)).toEqual(['proposed', 'armed', 'armed', 'executing']);
    unsubscribe();
    store.propose(action());
    expect(seen).toHaveLength(4);
  });
});

describe('confirm store, arming does not start the clock', () => {
  it('arm moves proposed to armed but does not start the countdown', () => {
    const { store } = harness();
    const { proposalId } = store.propose(action());
    const armed = store.arm(proposalId, 'yes please');

    expect(armed).not.toBeNull();
    expect(store.getState()?.state).toBe('armed');
    expect(store.getState()?.confirmationText).toBe('yes please');
    // The whole point of the fix: arming records the yes, but the stop window (and the
    // agent's "filing it now" sentence) has not started running yet.
    expect(store.getState()?.countdownStartedAt).toBeNull();
    expect(store.getState()?.stopWindowEndsAt).toBeNull();
  });

  it('arming an unknown id returns null', () => {
    const { store } = harness();
    expect(store.arm('prop_nope', 'yes')).toBeNull();
  });

  it('does not execute no matter how much time passes while only armed', async () => {
    const { store, clock, calls } = harness({ maxArmedWaitMs: 999_999 });
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');

    clock.advance(60_000);
    await store.settle(proposalId);

    expect(calls).toHaveLength(0);
    expect(store.getState()?.state).toBe('armed');
    expect(store.getState()?.countdownStartedAt).toBeNull();
  });
});

describe('confirm store, startCountdown and the stop window', () => {
  it('startCountdown starts the clock and reports when the window ends', () => {
    const { store, clock } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes please');

    const started = store.startCountdown(proposalId);

    expect(started).not.toBeNull();
    expect(started?.stopWindowEndsAt).toBe(clock.now() + 3000);
    expect(store.getState()?.countdownStartedAt).toBe(clock.now());
    expect(store.getState()?.stopWindowEndsAt).toBe(clock.now() + 3000);
  });

  it('startCountdown on an unarmed, unknown, or already-counting proposal returns null', () => {
    const { store } = harness();
    expect(store.startCountdown('prop_nope')).toBeNull();

    const { proposalId } = store.propose(action());
    // Still just 'proposed': nobody said yes yet.
    expect(store.startCountdown(proposalId)).toBeNull();

    store.arm(proposalId, 'yes');
    expect(store.startCountdown(proposalId)).not.toBeNull();
    // Already counting down: a second call must not restart the window.
    expect(store.startCountdown(proposalId)).toBeNull();
  });

  it('does not execute before the window runs out', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);

    clock.advance(2999);
    await store.settle(proposalId);

    expect(calls).toHaveLength(0);
    expect(store.getState()?.state).toBe('armed');
  });

  it('executes once the window runs out, with a token', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes go ahead');
    store.startCountdown(proposalId);

    clock.advance(3000);
    const settled = await store.settle(proposalId);

    expect(calls).toHaveLength(1);
    expect(calls[0].meta.token).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0].meta.confirmationText).toBe('yes go ahead');
    expect(settled?.state).toBe('done');
  });

  it('hands the executor the exact method, path and body', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    clock.advance(3000);
    await store.settle(proposalId);

    expect(calls[0].action.method).toBe('POST');
    expect(calls[0].action.path).toBe('/api/requirements');
    expect(calls[0].action.body).toEqual({
      description: 'I need a software license',
      category: 'software',
      priority: 'high',
    });
  });

  it('keeps the result on the settled snapshot', async () => {
    const { store, clock } = harness({ result: { requirement: { id: 7, code: 'REQ-0007' } } });
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    clock.advance(3000);
    const settled = await store.settle(proposalId);

    expect(settled?.result).toEqual({ requirement: { id: 7, code: 'REQ-0007' } });
  });

  it('executes only once even if tick is called repeatedly', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    clock.advance(5000);

    store.tick();
    store.tick();
    store.tick();
    await store.settle(proposalId);

    expect(calls).toHaveLength(1);
  });
});

describe('confirm store, the maxArmedWaitMs safety net', () => {
  it('auto-starts the countdown if startCountdown is never called', async () => {
    const { store, clock, calls } = harness({ maxArmedWaitMs: 8000 });
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');

    // Neither "the agent finished speaking" nor a click ever arrives in this scenario.
    clock.advance(7999);
    await store.settle(proposalId);
    expect(calls).toHaveLength(0);
    expect(store.getState()?.countdownStartedAt).toBeNull();

    // maxArmedWaitMs has now elapsed since arm(): the safety net starts the clock on its own.
    clock.advance(1);
    await store.settle(proposalId);
    expect(store.getState()?.countdownStartedAt).toBe(clock.now());
    expect(calls).toHaveLength(0); // the countdown just started; stopWindowMs has not run yet

    clock.advance(3000);
    await store.settle(proposalId);
    expect(calls).toHaveLength(1);
  });

  it('does not auto-start early: nothing happens before maxArmedWaitMs elapses', async () => {
    const { store, clock, calls } = harness({ maxArmedWaitMs: 8000 });
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');

    clock.advance(7999);
    await store.settle(proposalId);

    expect(store.getState()?.countdownStartedAt).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('confirm store, stopping', () => {
  it('stop before arming prevents execution', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());

    expect(store.stop(proposalId)?.state).toBe('stopped');
    clock.advance(10_000);
    await store.settle(proposalId);

    expect(calls).toHaveLength(0);
  });

  it('stop between arm and startCountdown cancels', async () => {
    const { store, clock, calls } = harness({ maxArmedWaitMs: 999_999 });
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    // Still waiting on the agent to finish speaking (or a click): the countdown never started.
    expect(store.getState()?.countdownStartedAt).toBeNull();

    expect(store.stop(proposalId)?.state).toBe('stopped');
    // A late startCountdown (e.g. a stray onModeChange after the person already said stop)
    // must not resurrect it.
    expect(store.startCountdown(proposalId)).toBeNull();

    clock.advance(10_000);
    await store.settle(proposalId);
    expect(calls).toHaveLength(0);
  });

  it('stop inside the window prevents execution', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);

    clock.advance(1500);
    expect(store.stop(proposalId)?.state).toBe('stopped');

    clock.advance(5000);
    await store.settle(proposalId);
    expect(calls).toHaveLength(0);
  });

  it('stop after execution started is a no-op', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    clock.advance(3000);
    await store.settle(proposalId);

    const after = store.stop(proposalId);
    expect(after?.state).toBe('done');
    expect(calls).toHaveLength(1);
  });

  it('stopping an unknown id returns null', () => {
    const { store } = harness();
    expect(store.stop('prop_nope')).toBeNull();
  });
});

describe('confirm store, interruption', () => {
  it('pause holds the window open and resume extends it by the paused duration', async () => {
    const { store, clock, calls } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);

    clock.advance(1000);
    store.pause();
    expect(store.getState()?.paused).toBe(true);

    // Four seconds of interruption. Without the pause this would be well past the window.
    clock.advance(4000);
    await store.settle(proposalId);
    expect(calls).toHaveLength(0);

    store.resume();
    expect(store.getState()?.paused).toBe(false);

    // The window now ends 2000 ms after resume, which is what was left when it paused.
    clock.advance(1999);
    await store.settle(proposalId);
    expect(calls).toHaveLength(0);

    clock.advance(1);
    await store.settle(proposalId);
    expect(calls).toHaveLength(1);
  });

  it('resume without a pause does nothing', () => {
    const { store } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    const before = store.getState()?.stopWindowEndsAt;
    store.resume();
    expect(store.getState()?.stopWindowEndsAt).toBe(before);
  });

  it('pausing before startCountdown pushes back the maxArmedWaitMs safety net too', async () => {
    const { store, clock, calls } = harness({ maxArmedWaitMs: 3000 });
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes'); // armedAt = 1000

    clock.advance(1000); // t = 2000
    store.pause(); // pausedAt = 2000

    clock.advance(5000); // t = 7000: well past armedAt+3000 if the pause did not count
    await store.settle(proposalId);
    expect(store.getState()?.countdownStartedAt).toBeNull();
    expect(calls).toHaveLength(0);

    store.resume(); // paused = 7000 - 2000 = 5000; armedAt becomes 1000 + 5000 = 6000
    clock.advance(1999); // t = 8999: short of armedAt(6000) + 3000 = 9000
    await store.settle(proposalId);
    expect(store.getState()?.countdownStartedAt).toBeNull();

    clock.advance(1); // t = 9000: the safety net fires
    await store.settle(proposalId);
    expect(store.getState()?.countdownStartedAt).not.toBeNull();
  });
});

describe('confirm store, failure and the token', () => {
  it('an executor that throws lands in failed with the message', async () => {
    const { store, clock } = harness({ fail: 'Only an admin can change a ticket' });
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    clock.advance(3000);
    const settled = await store.settle(proposalId);

    expect(settled?.state).toBe('failed');
    expect(settled?.error).toBe('Only an admin can change a ticket');
    expect(settled?.result).toBeNull();
  });

  it('the token never appears on any snapshot', async () => {
    const { store, clock } = harness();
    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    clock.advance(3000);

    const executing = store.tick();
    expect(JSON.stringify(executing)).not.toMatch(/[0-9a-f]{64}/);
    expect(Object.keys(executing ?? {})).not.toContain('token');

    await store.settle(proposalId);
    expect(Object.keys(store.getState() ?? {})).not.toContain('token');
  });

  it('the token is valid only while the write is in flight', async () => {
    const clock = fakeClock();
    let captured = '';
    let seenDuringCall = false;
    const store: ConfirmStore = createConfirmStore({
      now: clock.now,
      stopWindowMs: 3000,
      execute: async (_a, meta) => {
        captured = meta.token;
        seenDuringCall = store.isTokenValid(meta.token);
        return { requirement: { id: 1, code: 'REQ-0001' } };
      },
    });

    const { proposalId } = store.propose(action());
    store.arm(proposalId, 'yes');
    store.startCountdown(proposalId);
    clock.advance(3000);
    await store.settle(proposalId);

    expect(seenDuringCall).toBe(true);
    expect(store.isTokenValid(captured)).toBe(false);
  });

  it('a token nobody minted is never valid', () => {
    const { store } = harness();
    expect(store.isTokenValid('f'.repeat(64))).toBe(false);
    expect(store.isTokenValid('')).toBe(false);
  });

  it('two proposals get different tokens', async () => {
    const { store, clock, calls } = harness();
    const first = store.propose(action()).proposalId;
    store.arm(first, 'yes');
    store.startCountdown(first);
    clock.advance(3000);
    await store.settle(first);

    const second = store.propose(action()).proposalId;
    store.arm(second, 'yes');
    store.startCountdown(second);
    clock.advance(3000);
    await store.settle(second);

    expect(calls).toHaveLength(2);
    expect(calls[0].meta.token).not.toBe(calls[1].meta.token);
  });

  it('never executes an action the person did not arm', async () => {
    const execute = vi.fn();
    const clock = fakeClock();
    const store = createConfirmStore({ now: clock.now, stopWindowMs: 3000, execute });

    const { proposalId } = store.propose(action());
    clock.advance(60_000);
    await store.settle(proposalId);

    expect(execute).not.toHaveBeenCalled();
    expect(store.getState()?.state).toBe('proposed');
  });
});
