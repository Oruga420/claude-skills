/**
 * EXAMPLE: tests the reduced example registry (view + read + write + tour tools only).
 * The exact counts below (22 tools, 24 with the 2 control tools) belong to this template's
 * example tool set; they will change the moment a real app adds its own tool files (an
 * admin.ts, a lifecycle.ts) into VOICE_TOOLS. Keep the pattern, not the numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  VOICE_TOOLS,
  VOICE_CONTROL_TOOLS,
  toolsForRole,
  runTool,
  exportRegistry,
  getTool,
} from '@/lib/voice/tools/registry';
import { normalizeCode, matchCategory, matchStatusFilter } from '@/lib/voice/tools/read';
// EXAMPLE: this project's registry also has an admin.ts and a lifecycle.ts spread into
// VOICE_TOOLS (see registry.ts); a real app importing their tool arrays here the same way
// would extend the list this file asserts against.
import { TOUR_TOOLS } from '@/lib/voice/tools/tour';
import { createConfirmStore } from '@/lib/voice/confirm';
import { VOICE_SOURCE_HEADER, VOICE_CONFIRMATION_HEADER, ApiError, type ToolContext, type VoiceRole } from '@/lib/voice/tools/types';

// --- Fakes -----------------------------------------------------------------------------

const REQ_42 = {
  id: 42,
  code: 'REQ-0042',
  title: 'Design app will not update',
  description: 'The launcher asks for credentials in a loop',
  category: 'software',
  subcategory: 'login',
  priority: 'high',
  status: 'pending',
  requester_id: 7,
  assignee_id: 3,
  requester_name: 'June Harlow',
  assignee_name: 'Mara Quill',
  needed_by: null,
  created_at: '2026-09-01T10:00:00Z',
  parent_id: null,
  parent_code: null,
};

interface Harness {
  ctx: ToolContext;
  fetched: string[];
  dispatched: Array<{ navigate?: string; filters?: Record<string, unknown> }>;
  clock: { now: () => number; advance: (ms: number) => void };
}

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function makeCtx(options: {
  role?: VoiceRole;
  userId?: number;
  routes?: Record<string, unknown>;
  /** Throws on any fetch. Used to prove a propose tool reaches no network. */
  noFetch?: boolean;
} = {}): Harness {
  const fetched: string[] = [];
  const dispatched: Array<{ navigate?: string; filters?: Record<string, unknown> }> = [];
  const clock = fakeClock();

  // Overrides come first so a test that supplies its own route wins the prefix match below.
  const routes: Record<string, unknown> = {
    ...(options.routes ?? {}),
    '/api/requirements?q=REQ-0042&limit=25&include=subtasks': { requirements: [REQ_42] },
    '/api/requirements/42': { requirement: REQ_42, events: [] },
    '/api/auth/me': { counts: { assignedToMe: 4, myOpenTickets: 2 } },
    '/api/users': {
      users: [
        { id: 3, name: 'Mara Quill', email: 'mquill@example.com', role: 'admin' },
        { id: 5, name: 'Tess Quill', email: 'tquill@example.com', role: 'agent' },
        { id: 9, name: 'Otto Lind', email: 'olind@example.com', role: 'agent' },
      ],
    },
  };

  const ctx: ToolContext = {
    user: {
      id: options.userId ?? 1,
      name: 'Grace Hopper',
      email: 'dev01@example.com',
      role: options.role ?? 'member',
    },
    async fetchJson<T>(path: string): Promise<T> {
      if (options.noFetch) throw new Error(`fetchJson must not be called, but got ${path}`);
      fetched.push(path);
      // Exact first, then a prefix match so a query string the tool builds does not have to
      // be guessed exactly in every test.
      const keys = Object.keys(routes);
      const key = keys.find((r) => r === path) ?? keys.find((r) => path.startsWith(r.split('?')[0] + '?'));
      if (key === undefined) throw new ApiError('Not found', 404);
      return routes[key] as T;
    },
    dispatchViewCommand: (cmd) => {
      dispatched.push(cmd);
    },
    notifyDataChanged: () => {},
    confirm: createConfirmStore({ now: clock.now, stopWindowMs: 3000, execute: async () => ({}) }),
    now: clock.now,
  };

  return { ctx, fetched, dispatched, clock };
}

// --- Shape of the registry --------------------------------------------------------------

describe('registry shape', () => {
  it('holds exactly 22 tools', () => {
    expect(VOICE_TOOLS).toHaveLength(22);
  });

  it('holds exactly 2 control tools, named confirm_action and stop_action', () => {
    expect(VOICE_CONTROL_TOOLS.map((t) => t.name)).toEqual(['confirm_action', 'stop_action']);
  });

  it('gives every tool a unique name', () => {
    const names = [...VOICE_TOOLS, ...VOICE_CONTROL_TOOLS].map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('lists the eight view and read tools before the seven writes, then tour', () => {
    // The first 15 are this example registry's tool table (view, read and write), spelled out
    // because their order is deliberate and load-bearing. Tour is a whole file's array appended
    // in one piece, so deriving it from the import means adding a tool to tour.ts only changes
    // the total count here, never this list. A real app that also spreads in its own admin.ts
    // or lifecycle.ts (see registry.ts) would extend first15 and this expectation the same way.
    const first15 = [
      'navigate',
      'set_history_filters',
      'set_home_filters',
      'list_requirements',
      'get_requirement',
      'get_my_counts',
      'get_stats',
      'start_new_requirement',
      'propose_create_requirement',
      'propose_take_requirement',
      'propose_assign_requirement',
      'propose_set_status',
      'propose_cancel_requirement',
      'propose_add_comment',
      'propose_add_subtask',
    ];
    expect(VOICE_TOOLS.map((t) => t.name)).toEqual([
      ...first15,
      ...TOUR_TOOLS.map((t) => t.name),
    ]);
  });

  it('gives every tool an object input schema', () => {
    for (const tool of [...VOICE_TOOLS, ...VOICE_CONTROL_TOOLS]) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(typeof tool.inputSchema.properties, tool.name).toBe('object');
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });

  it('expects a response from every tool, inside the vendor 120 second cap', () => {
    for (const tool of [...VOICE_TOOLS, ...VOICE_CONTROL_TOOLS]) {
      expect(tool.expectsResponse, tool.name).toBe(true);
      expect(tool.responseTimeoutSecs, tool.name).toBeGreaterThan(0);
      expect(tool.responseTimeoutSecs, tool.name).toBeLessThanOrEqual(120);
    }
  });

  it('marks every propose tool consequential, and nothing else', () => {
    const consequential = VOICE_TOOLS.filter((t) => t.annotations.consequentialHint).map((t) => t.name).sort();
    // A real app's own tool files (an admin.ts with a sign_out, say) would extend this the same
    // way: anything that ends a session or otherwise acts without being a propose_* write still
    // belongs in this set if it raises the confirm overlay.
    const expectedConsequential = VOICE_TOOLS
      .filter((t) => t.name.startsWith('propose_'))
      .map((t) => t.name)
      .sort();
    expect(consequential).toEqual(expectedConsequential);
  });

  it('marks every view or read tool read only, and nothing else', () => {
    const readOnly = VOICE_TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name).sort();
    const expectedReadOnly = VOICE_TOOLS
      .filter((t) => t.kind === 'view' || t.kind === 'read')
      .map((t) => t.name)
      .sort();
    expect(readOnly).toEqual(expectedReadOnly);
    expect(readOnly.some((n) => n.startsWith('propose_'))).toBe(false);
  });

  it('getTool finds both registry and control tools, and nothing else', () => {
    expect(getTool('navigate')?.name).toBe('navigate');
    expect(getTool('confirm_action')?.name).toBe('confirm_action');
    expect(getTool('drop_database')).toBeUndefined();
  });
});

describe('exportRegistry', () => {
  it('exports 22 tools and 2 control tools', () => {
    const exported = exportRegistry();
    expect(exported.tools).toHaveLength(22);
    expect(exported.controlTools).toHaveLength(2);
  });

  it('exports pure data that survives a JSON round trip', () => {
    const exported = exportRegistry();
    const round = JSON.parse(JSON.stringify(exported));
    expect(round).toEqual(exported);
    expect(round.tools[0]).toHaveProperty('inputSchema');
    expect(round.tools[0]).toHaveProperty('expectsResponse');
    expect(round.tools[0]).toHaveProperty('responseTimeoutSecs');
    expect(round.tools[0]).not.toHaveProperty('execute');
  });

  it('gives every exported tool a description that says when to call it', () => {
    for (const tool of exportRegistry().tools) {
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
    }
  });
});

// --- Permission mirror -------------------------------------------------------------------

/** Every tool VOICE_TOOLS restricts away from `role`, read off allowedRoles rather than a
 *  hand-kept list, so a newly admin-gated tool is covered here without editing this file. */
function adminOnlyFor(role: VoiceRole): string[] {
  return VOICE_TOOLS.filter((t) => Array.isArray(t.allowedRoles) && !t.allowedRoles.includes(role)).map(
    (t) => t.name,
  );
}

describe('toolsForRole', () => {
  it('hides every admin only tool from a member', () => {
    const names = toolsForRole('member').map((t) => t.name);
    for (const admin of adminOnlyFor('member')) expect(names).not.toContain(admin);
  });

  it('hides every admin only tool from an agent too, because the routes are admin only', () => {
    const names = toolsForRole('agent').map((t) => t.name);
    for (const admin of adminOnlyFor('agent')) expect(names).not.toContain(admin);
  });

  it('gives an admin all 22 plus the 2 control tools', () => {
    expect(toolsForRole('admin')).toHaveLength(24);
  });

  it('always includes the control tools, whoever is calling', () => {
    for (const role of ['member', 'agent', 'admin'] as VoiceRole[]) {
      const names = toolsForRole(role).map((t) => t.name);
      expect(names, role).toContain('confirm_action');
      expect(names, role).toContain('stop_action');
    }
  });

  it('leaves create, cancel and comment open to everyone', () => {
    const names = toolsForRole('member').map((t) => t.name);
    expect(names).toContain('propose_create_requirement');
    expect(names).toContain('propose_cancel_requirement');
    expect(names).toContain('propose_add_comment');
  });
});

describe('runTool permission gate', () => {
  it('refuses a member calling propose_set_status and names who can', async () => {
    const { ctx } = makeCtx({ role: 'member' });
    const result = await runTool('propose_set_status', { code: 'REQ-0042', status: 'closed', note: 'done' }, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.kind).toBe('forbidden');
    expect(result.speak).toContain('Only an admin');
    expect(result.speak.length).toBeGreaterThan(20);
  });

  it('refuses an agent calling propose_take_requirement', async () => {
    const { ctx } = makeCtx({ role: 'agent' });
    const result = await runTool('propose_take_requirement', { code: 'REQ-0042' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  it('refuses before touching the network', async () => {
    const { ctx, fetched } = makeCtx({ role: 'member' });
    await runTool('propose_add_subtask', { code: 'REQ-0042', title: 'Order the license' }, ctx);
    expect(fetched).toHaveLength(0);
  });

  it('answers an unknown tool name without throwing', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('delete_everything', {}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('error');
  });
});

describe('runTool input validation', () => {
  it('asks again when a required field is missing', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('get_requirement', {}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('question');
      expect(result.speak).toContain('code');
    }
  });

  it('rejects a field the schema does not declare', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('get_my_counts', { sql: 'DROP TABLE users' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
  });

  it('rejects a value of the wrong type', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('navigate', { destination: 42 }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.speak).toContain('text');
  });

  it('rejects a value outside an enum', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('list_requirements', { scope: 'everything' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
  });

  it('turns a throw inside a tool into something speakable', async () => {
    const { ctx } = makeCtx();
    ctx.fetchJson = async () => {
      throw new TypeError('network down');
    };
    const result = await runTool('get_my_counts', {}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.speak.length).toBeGreaterThan(5);
  });
});

// --- Resolution helpers --------------------------------------------------------------------

describe('code and label resolution', () => {
  it('normalizes the ways a person says a ticket code', () => {
    expect(normalizeCode('REQ-0042')).toBe('REQ-0042');
    expect(normalizeCode('req 42')).toBe('REQ-0042');
    expect(normalizeCode('REQ42')).toBe('REQ-0042');
    expect(normalizeCode('42')).toBe('REQ-0042');
    expect(normalizeCode('REQ-0042.3')).toBe('REQ-0042.3');
    expect(normalizeCode('the Software one')).toBeNull();
  });

  it('matches a category by value or by spoken label', () => {
    expect(matchCategory('software')).toEqual({ value: 'software' });
    expect(matchCategory('Software')).toEqual({ value: 'software' });
    expect(matchCategory('Drive access')).toEqual({ value: 'drive_access' });
  });

  it('returns the options rather than guessing an unknown category', () => {
    const result = matchCategory('quantum computing');
    expect('options' in result).toBe(true);
    if ('options' in result) expect(result.options.length).toBeGreaterThan(3);
  });

  it('accepts outstanding as a filter word but never as a status', () => {
    expect(matchStatusFilter('outstanding')).toEqual({ value: 'outstanding' });
    expect(matchStatusFilter('in progress')).toEqual({ value: 'in_progress' });
    expect('options' in matchStatusFilter('nearly done')).toBe(true);
  });
});

// --- Read tools ------------------------------------------------------------------------

describe('read tools', () => {
  it('get_requirement resolves a code to the numeric id and speaks the ticket', async () => {
    const { ctx, fetched } = makeCtx();
    const result = await runTool('get_requirement', { code: 'req 42' }, ctx);

    expect(fetched[0]).toContain('q=REQ-0042');
    expect(fetched[1]).toBe('/api/requirements/42');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.speak).toContain('REQ-0042');
      expect(result.speak).toContain('Mara Quill');
    }
  });

  it('get_requirement answers not_found for a code that resolves to nothing', async () => {
    const { ctx } = makeCtx({ routes: { '/api/requirements?q=REQ-0099&limit=25&include=subtasks': { requirements: [] } } });
    const result = await runTool('get_requirement', { code: 'REQ-0099' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('not_found');
      expect(result.speak).toContain('REQ-0099');
    }
  });

  it('list_requirements asks back rather than guessing an unknown category', async () => {
    const { ctx, fetched } = makeCtx();
    const result = await runTool('list_requirements', { category: 'quantum computing' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
    expect(fetched).toHaveLength(0);
  });

  it('list_requirements condenses the answer instead of reading every row', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ ...REQ_42, id: i + 1, code: `REQ-000${i + 1}` }));
    const { ctx } = makeCtx({ routes: { '/api/requirements': { requirements: rows } } });
    const result = await runTool('list_requirements', { scope: 'assigned_to_me' }, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.speak).toContain('9 tickets');
      expect(result.speak).toContain('waiting on you');
      expect((result.data as { requirements: unknown[] }).requirements).toHaveLength(9);
      // Three rows spoken, six left in the data for follow up questions.
      expect(result.speak.match(/REQ-/g)).toHaveLength(3);
    }
  });

  it('get_my_counts speaks both numbers', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('get_my_counts', {}, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.speak).toContain('4');
      expect(result.speak).toContain('2');
    }
  });

  it('get_stats speaks the totals', async () => {
    const { ctx } = makeCtx({
      routes: {
        '/api/stats': {
          stats: {
            kpis: { total: 120, pending: 10, in_progress: 5, on_hold: 2, closed: 100, cancelled: 3, outstanding: 17, avgResolutionDays: 2.5 },
          },
        },
      },
    });
    const result = await runTool('get_stats', { status: 'outstanding' }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.speak).toContain('120');
      expect(result.speak).toContain('17');
      expect(result.speak).toContain('2.5 days');
    }
  });
});

// --- View tools ------------------------------------------------------------------------

describe('view tools', () => {
  it('navigate dispatches a view command for a named destination', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('navigate', { destination: 'history' }, ctx);
    expect(dispatched).toEqual([{ navigate: '/history' }]);
    expect(result.ok).toBe(true);
  });

  it('navigate refuses to send a member to Admin', async () => {
    const { ctx, dispatched } = makeCtx({ role: 'member' });
    const result = await runTool('navigate', { destination: 'admin' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
    expect(dispatched).toHaveLength(0);
  });

  it('navigate resolves a ticket code to its detail page', async () => {
    const { ctx, dispatched } = makeCtx();
    await runTool('navigate', { destination: 'REQ-0042' }, ctx);
    expect(dispatched).toEqual([{ navigate: '/requirements/42' }]);
  });

  it('navigate asks where to go when the destination is not a place or a code', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('navigate', { destination: 'somewhere nice' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
  });

  it('navigate opens Admin on a specific tab for an admin', async () => {
    const { ctx, dispatched } = makeCtx({ role: 'admin' });
    const result = await runTool('navigate', { destination: 'admin', tab: 'routing' }, ctx);
    expect(result.ok).toBe(true);
    expect(dispatched).toEqual([{ navigate: '/admin?tab=routing' }]);
    if (result.ok) expect(result.speak).toContain('Auto-routing');
  });

  it('navigate asks which tab when given an admin tab it does not know', async () => {
    const { ctx, dispatched } = makeCtx({ role: 'admin' });
    const result = await runTool('navigate', { destination: 'admin', tab: 'billing' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
    expect(dispatched).toHaveLength(0);
  });

  it('navigate still refuses a member sent to Admin even with a tab given', async () => {
    const { ctx, dispatched } = makeCtx({ role: 'member' });
    const result = await runTool('navigate', { destination: 'admin', tab: 'users' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
    expect(dispatched).toHaveLength(0);
  });

  it('navigate ignores a tab given for a destination other than admin', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('navigate', { destination: 'history', tab: 'routing' }, ctx);
    expect(result.ok).toBe(true);
    expect(dispatched).toEqual([{ navigate: '/history' }]);
  });

  it('set_history_filters maps spoken labels onto stored values', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_history_filters', { category: 'Software', status: 'in progress' }, ctx);

    expect(result.ok).toBe(true);
    expect(dispatched[0].navigate).toBe('/history');
    expect(dispatched[0].filters).toEqual({ category: 'software', status: 'in_progress' });
  });

  it('set_history_filters clears everything on request', async () => {
    const { ctx, dispatched } = makeCtx();
    await runTool('set_history_filters', { clear: true }, ctx);
    expect(dispatched[0].filters).toMatchObject({ scope: 'all', status: '', category: '' });
  });

  it('set_history_filters asks what to filter by when given nothing', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_history_filters', {}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
    expect(dispatched).toHaveLength(0);
  });

  it('set_history_filters resolves a relative range without asking for today\'s date', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_history_filters', { range: 'last month' }, ctx);

    expect(result.ok).toBe(true);
    expect(dispatched[0].filters?.from).toBeTruthy();
    expect(dispatched[0].filters?.to).toBeTruthy();
    if (result.ok) {
      expect(result.speak).toMatch(/from .+ to .+\.$/);
    }
  });

  it('set_history_filters asks a question when the range cannot be understood', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_history_filters', { range: 'the fortnight before eternity' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
    expect(dispatched).toHaveLength(0);
  });

  it('set_history_filters turns include_subtasks on', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_history_filters', { include_subtasks: true }, ctx);
    expect(result.ok).toBe(true);
    expect(dispatched[0].filters).toEqual({ include: 'subtasks' });
    if (result.ok) expect(result.speak).toContain('including subtasks');
  });

  it('set_history_filters turns include_subtasks off explicitly', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_history_filters', { include_subtasks: false }, ctx);
    expect(result.ok).toBe(true);
    expect(dispatched[0].filters).toEqual({ include: '' });
    if (result.ok) expect(result.speak).toContain('without subtasks');
  });

  it('set_history_filters clears include_subtasks along with everything else', async () => {
    const { ctx, dispatched } = makeCtx();
    await runTool('set_history_filters', { clear: true }, ctx);
    expect(dispatched[0].filters).toMatchObject({ include: '' });
  });

  it('set_home_filters maps spoken labels and dispatches to Home', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_home_filters', { category: 'Software', priority: 'High' }, ctx);

    expect(result.ok).toBe(true);
    expect(dispatched[0].navigate).toBe('/');
    expect(dispatched[0].filters).toEqual({ category: 'software', priority: 'high' });
    if (result.ok) expect(result.speak).toContain('Home now shows');
  });

  it('set_home_filters clears everything on request', async () => {
    const { ctx, dispatched } = makeCtx();
    await runTool('set_home_filters', { clear: true }, ctx);
    expect(dispatched[0].navigate).toBe('/');
    expect(dispatched[0].filters).toMatchObject({ category: '', priority: '', q: '' });
  });

  it('set_home_filters asks a question rather than guessing an unknown category', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_home_filters', { category: 'quantum computing' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
    expect(dispatched).toHaveLength(0);
  });

  it('set_home_filters asks what to filter by when given nothing', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_home_filters', {}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
    expect(dispatched).toHaveLength(0);
  });

  it('set_home_filters filters by a search term alone', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('set_home_filters', { q: 'launcher' }, ctx);
    expect(result.ok).toBe(true);
    expect(dispatched[0].filters).toEqual({ q: 'launcher' });
  });

  it('start_new_requirement opens the form prefilled and files nothing', async () => {
    const { ctx, dispatched } = makeCtx();
    const result = await runTool('start_new_requirement', { category: 'Software', description: 'launcher loop' }, ctx);
    expect(result.ok).toBe(true);
    expect(dispatched[0].navigate).toContain('new=1');
    expect(dispatched[0].navigate).toContain('category=software');
    expect(ctx.confirm.getState()).toBeNull();
  });
});

// --- Propose tools -----------------------------------------------------------------------

describe('propose tools', () => {
  it('propose_create_requirement raises a proposal without touching the network', async () => {
    const { ctx } = makeCtx({ noFetch: true });
    const result = await runTool(
      'propose_create_requirement',
      { description: 'I need a software license', category: 'Software', priority: 'High' },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { proposal_id: string; lines: string[] };
      expect(data.proposal_id).toBeTruthy();
      expect(data.lines.join(' ')).toContain('Software');
      expect(data.lines.join(' ')).toContain('High');
      expect(result.speak).toMatch(/\?$/);
    }
  });

  it('propose_create_requirement leaves the write pending, not done', async () => {
    const { ctx } = makeCtx({ noFetch: true });
    await runTool('propose_create_requirement', { description: 'I need a software license', category: 'software' }, ctx);

    const state = ctx.confirm.getState();
    expect(state?.state).toBe('proposed');
    expect(state?.action.method).toBe('POST');
    expect(state?.action.path).toBe('/api/requirements');
    expect(state?.action.body).toMatchObject({ category: 'software', priority: 'medium' });
  });

  it('propose_create_requirement asks which category rather than guessing', async () => {
    const { ctx } = makeCtx({ noFetch: true });
    const result = await runTool(
      'propose_create_requirement',
      { description: 'I need a thing', category: 'quantum computing' },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('question');
      expect(result.speak).toContain('Software');
    }
    expect(ctx.confirm.getState()).toBeNull();
  });

  it('propose_create_requirement sends onboarding to its own form', async () => {
    const { ctx } = makeCtx({ noFetch: true });
    const result = await runTool(
      'propose_create_requirement',
      { description: 'New designer starts Monday', category: 'onboarding' },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  it('propose_set_status refuses to close without a note, the way the route does', async () => {
    const { ctx } = makeCtx({ role: 'admin' });
    const result = await runTool('propose_set_status', { code: 'REQ-0042', status: 'close' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('question');
    expect(ctx.confirm.getState()).toBeNull();
  });

  it('propose_set_status builds the body the status route validates', async () => {
    const { ctx } = makeCtx({ role: 'admin' });
    const result = await runTool('propose_set_status', { code: 'REQ-0042', status: 'close', note: 'License issued' }, ctx);

    expect(result.ok).toBe(true);
    const state = ctx.confirm.getState();
    expect(state?.action.path).toBe('/api/requirements/42/status');
    expect(state?.action.body).toEqual({ status: 'closed', note: 'License issued' });
    expect(state?.action.title).toBe('Closing REQ-0042');
  });

  it('propose_take_requirement assigns the ticket to the caller', async () => {
    const { ctx } = makeCtx({ role: 'admin', userId: 11 });
    await runTool('propose_take_requirement', { code: 'REQ-0042' }, ctx);
    const state = ctx.confirm.getState();
    expect(state?.action.path).toBe('/api/requirements/42/assign');
    expect(state?.action.body).toEqual({ assignee_id: 11 });
  });

  it('propose_assign_requirement asks which person when a name matches two', async () => {
    const { ctx } = makeCtx({ role: 'admin' });
    const result = await runTool('propose_assign_requirement', { code: 'REQ-0042', assignee: 'quill' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('question');
      expect(result.speak).toContain('Mara Quill');
      expect(result.speak).toContain('Tess Quill');
    }
    expect(ctx.confirm.getState()).toBeNull();
  });

  it('propose_assign_requirement sends a ticket back to the queue as a null assignee', async () => {
    const { ctx } = makeCtx({ role: 'admin' });
    await runTool('propose_assign_requirement', { code: 'REQ-0042', assignee: 'queue' }, ctx);
    expect(ctx.confirm.getState()?.action.body).toEqual({ assignee_id: null });
  });

  it('propose_assign_requirement answers not_found for a name nobody has', async () => {
    const { ctx } = makeCtx({ role: 'admin' });
    const result = await runTool('propose_assign_requirement', { code: 'REQ-0042', assignee: 'Gandalf' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
  });

  it('propose_cancel_requirement refuses somebody who neither filed it nor is an admin', async () => {
    const { ctx } = makeCtx({ role: 'member', userId: 99 });
    const result = await runTool('propose_cancel_requirement', { code: 'REQ-0042' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
      expect(result.speak).toContain('June Harlow');
    }
  });

  it('propose_cancel_requirement lets the person who filed it withdraw it', async () => {
    const { ctx } = makeCtx({ role: 'member', userId: 7 });
    const result = await runTool('propose_cancel_requirement', { code: 'REQ-0042', note: 'Sorted it myself' }, ctx);

    expect(result.ok).toBe(true);
    expect(ctx.confirm.getState()?.action.path).toBe('/api/requirements/42/cancel');
    expect(ctx.confirm.getState()?.action.body).toEqual({ note: 'Sorted it myself' });
  });

  it('propose_cancel_requirement refuses the assignee, because the cancel route does', async () => {
    const { ctx } = makeCtx({ role: 'member', userId: 3 });
    const result = await runTool('propose_cancel_requirement', { code: 'REQ-0042' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  it('propose_add_comment lets the assignee comment', async () => {
    const { ctx } = makeCtx({ role: 'member', userId: 3 });
    const result = await runTool('propose_add_comment', { code: 'REQ-0042', note: 'Waiting on the vendor' }, ctx);

    expect(result.ok).toBe(true);
    expect(ctx.confirm.getState()?.action.body).toEqual({ note: 'Waiting on the vendor' });
  });

  it('propose_add_comment refuses an agent who is neither requester nor assignee', async () => {
    const { ctx } = makeCtx({ role: 'agent', userId: 77 });
    const result = await runTool('propose_add_comment', { code: 'REQ-0042', note: 'hello' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  it('propose_add_subtask builds the items array the subtasks route expects', async () => {
    const { ctx } = makeCtx({ role: 'admin' });
    await runTool('propose_add_subtask', { code: 'REQ-0042', title: 'Order the license', priority: 'Urgent' }, ctx);

    expect(ctx.confirm.getState()?.action.path).toBe('/api/requirements/42/subtasks');
    expect(ctx.confirm.getState()?.action.body).toEqual({
      items: [{ title: 'Order the license', priority: 'urgent' }],
    });
  });

  it('a second proposal supersedes the first, so one overlay is ever live', async () => {
    const { ctx } = makeCtx({ role: 'admin' });
    const first = await runTool('propose_add_comment', { code: 'REQ-0042', note: 'one' }, ctx);
    const second = await runTool('propose_add_comment', { code: 'REQ-0042', note: 'two' }, ctx);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      const firstId = (first.data as { proposal_id: string }).proposal_id;
      const secondId = (second.data as { proposal_id: string }).proposal_id;
      expect(ctx.confirm.getProposal(firstId)?.state).toBe('superseded');
      expect(ctx.confirm.getState()?.proposalId).toBe(secondId);
    }
  });
});

// --- Control tools -----------------------------------------------------------------------

describe('control tools', () => {
  it('confirm_action arms the proposal but the stop window has not started yet', async () => {
    const { ctx } = makeCtx({ noFetch: true });
    const proposed = await runTool('propose_create_requirement', { description: 'software license', category: 'software' }, ctx);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const id = (proposed.data as { proposal_id: string }).proposal_id;
    const confirmed = await runTool('confirm_action', { proposal_id: id, confirmation_text: 'yes go ahead' }, ctx);

    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.speak).toBe('Filing it as soon as I finish talking; say stop to cancel.');
    expect(ctx.confirm.getState()?.state).toBe('armed');
    expect(ctx.confirm.getState()?.confirmationText).toBe('yes go ahead');
    // The window starts once the agent's speech actually ends (VoiceCall's onModeChange),
    // not the instant this tool returns.
    expect(ctx.confirm.getState()?.countdownStartedAt).toBeNull();
  });

  it('confirm_action does not execute by itself', async () => {
    let executed = false;
    const { ctx, clock } = makeCtx({ noFetch: true });
    ctx.confirm = createConfirmStore({
      now: clock.now,
      stopWindowMs: 3000,
      execute: async () => {
        executed = true;
        return {};
      },
    });

    const proposed = await runTool('propose_create_requirement', { description: 'software license', category: 'software' }, ctx);
    if (!proposed.ok) throw new Error('expected a proposal');
    await runTool('confirm_action', {
      proposal_id: (proposed.data as { proposal_id: string }).proposal_id,
      confirmation_text: 'yes',
    }, ctx);

    expect(executed).toBe(false);
    expect(ctx.confirm.getState()?.state).toBe('armed');
  });

  it('confirm_action answers not_found when nothing is waiting', async () => {
    const { ctx } = makeCtx();
    const result = await runTool('confirm_action', { proposal_id: 'prop_nope', confirmation_text: 'yes' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
  });

  it('stop_action drops a pending proposal', async () => {
    const { ctx } = makeCtx({ noFetch: true });
    const proposed = await runTool('propose_create_requirement', { description: 'software license', category: 'software' }, ctx);
    if (!proposed.ok) throw new Error('expected a proposal');
    const id = (proposed.data as { proposal_id: string }).proposal_id;

    const stopped = await runTool('stop_action', { proposal_id: id }, ctx);
    expect(stopped.ok).toBe(true);
    if (stopped.ok) expect(stopped.speak).toContain('Nothing was sent');
    expect(ctx.confirm.getState()?.state).toBe('stopped');
  });

  it('stop_action is available to every role', async () => {
    for (const role of ['member', 'agent', 'admin'] as VoiceRole[]) {
      const { ctx } = makeCtx({ role });
      const result = await runTool('stop_action', { proposal_id: 'prop_nope' }, ctx);
      expect(result.ok, role).toBe(false);
      if (!result.ok) expect(result.kind, role).toBe('not_found');
    }
  });
});

// --- Header contract ---------------------------------------------------------------------

describe('voice write header contract', () => {
  it('names the two headers the write routes will read', () => {
    expect(VOICE_SOURCE_HEADER).toBe('X-App-Source');
    expect(VOICE_CONFIRMATION_HEADER).toBe('X-App-Confirmation');
  });
});
