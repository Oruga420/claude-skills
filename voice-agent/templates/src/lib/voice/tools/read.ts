/**
 * EXAMPLE: replace with your app's own read tools and resolution helpers.
 *
 * The four read tools, plus the resolution helpers the whole registry shares.
 *
 * Every one of these calls a GET route that already exists and is already scoped by canView
 * on the server, so there is no permission mirror to keep here: a member asking for the queue
 * gets their own rows back, not a refusal. What the tools do add is condensation. A voice
 * answer that reads out twenty five rows is useless, so each tool speaks the count and the
 * few rows that matter and leaves the full payload in `data` for the agent to draw on.
 */

import { CATEGORIES, PRIORITIES, STATUSES, OUTSTANDING_FILTER } from '@/lib/format';
import {
  ApiError,
  DEFAULT_RESPONSE_TIMEOUT_SECS,
  type JsonSchema,
  type ToolContext,
  type ToolResult,
  type VoiceTool,
} from './types';

// --- Shapes the routes return, narrowed to what the voice layer reads ------------------

export interface VoiceRequirement {
  id: number;
  code: string;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  priority: string;
  status: string;
  requester_id: number;
  assignee_id: number | null;
  requester_name: string;
  assignee_name: string | null;
  needed_by: string | null;
  created_at: string;
  parent_id: number | null;
  parent_code: string | null;
}

export interface VoiceEvent {
  id: number;
  type: string;
  note: string | null;
  source: string;
  created_at: string;
  actor_name: string | null;
}

export interface VoiceCounts {
  assignedToMe: number;
  myOpenTickets: number;
}

export interface VoiceKpis {
  total: number;
  pending: number;
  in_progress: number;
  on_hold: number;
  closed: number;
  cancelled: number;
  outstanding: number;
  avgResolutionDays: number | null;
}

// --- Shared resolution helpers ---------------------------------------------------------

/**
 * Speech recognition hands back "req 42", "REQ 0042", "req-42". They all mean REQ-0042.
 * Returns null when the text carries no ticket code at all.
 */
export function normalizeCode(raw: string): string | null {
  const text = String(raw ?? '').trim().toUpperCase();
  if (text.length === 0) return null;
  // A subtask code is the parent code plus a dot and a sequence: REQ-0042.3
  const match = text.match(/^R\s*E\s*Q[\s-]*0*(\d+)(?:\.(\d+))?$/) ?? text.match(/^0*(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const parent = `REQ-${match[1].padStart(4, '0')}`;
  return match[2] ? `${parent}.${match[2]}` : parent;
}

/**
 * Turns a code into the numeric id the detail route needs. GET /api/requirements/[id] takes
 * an id, not a code, so a lookup is unavoidable; the list route's `q` searches code and text,
 * which is why the exact match is re-checked here rather than trusting the first row back.
 */
export async function resolveCode(
  ctx: ToolContext,
  rawCode: string,
): Promise<{ requirement: VoiceRequirement } | { error: ToolResult<never> }> {
  const code = normalizeCode(rawCode);
  if (code === null) {
    return {
      error: {
        ok: false,
        kind: 'question',
        speak: 'I did not catch a ticket code. Which ticket do you mean, for example REQ 42?',
      },
    };
  }

  let rows: VoiceRequirement[];
  try {
    const res = await ctx.fetchJson<{ requirements: VoiceRequirement[] }>(
      `/api/requirements?q=${encodeURIComponent(code)}&limit=25&include=subtasks`,
    );
    rows = res.requirements ?? [];
  } catch (err) {
    return { error: apiFailure(err, `I could not look up ${code}.`) };
  }

  const exact = rows.find((row) => row.code.toUpperCase() === code);
  if (!exact) {
    return {
      error: {
        ok: false,
        kind: 'not_found',
        speak: `I cannot find ${code}. Either it does not exist or it is not one you can see.`,
      },
    };
  }
  return { requirement: exact };
}

/** Accepts a stored value or a spoken label, case insensitively. */
export function matchCategory(raw: string): { value: string } | { options: string[] } {
  const text = String(raw ?? '').trim().toLowerCase();
  const hit = CATEGORIES.find(
    (c) => c.value.toLowerCase() === text || c.label.toLowerCase() === text,
  );
  if (hit) return { value: hit.value };
  const loose = CATEGORIES.filter(
    (c) => text.length >= 3 && (c.label.toLowerCase().includes(text) || c.value.toLowerCase().includes(text)),
  );
  if (loose.length === 1) return { value: loose[0].value };
  return { options: CATEGORIES.map((c) => c.label) };
}

export function matchPriority(raw: string): { value: string } | { options: string[] } {
  const text = String(raw ?? '').trim().toLowerCase();
  const hit = PRIORITIES.find((p) => p.value.toLowerCase() === text || p.label.toLowerCase() === text);
  if (hit) return { value: hit.value };
  return { options: PRIORITIES.map((p) => p.label) };
}

/** Statuses plus the synthetic "outstanding" filter word, which is a filter and never a status. */
export function matchStatusFilter(raw: string): { value: string } | { options: string[] } {
  const text = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (text === OUTSTANDING_FILTER || text === 'open' || text === 'outstanding') {
    return { value: OUTSTANDING_FILTER };
  }
  const hit = STATUSES.find((s) => s.value.toLowerCase() === text || s.label.toLowerCase().replace(/\s+/g, '_') === text);
  if (hit) return { value: hit.value };
  return { options: [...STATUSES.map((s) => s.label), 'Outstanding'] };
}

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function priorityLabel(value: string): string {
  return PRIORITIES.find((p) => p.value === value)?.label ?? value;
}

export function statusLabel(value: string): string {
  return STATUSES.find((s) => s.value === value)?.label ?? value;
}

/** One place that turns a thrown ApiError into a sentence the agent can say. */
export function apiFailure(err: unknown, prefix: string): ToolResult<never> {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return { ok: false, kind: 'error', speak: 'Your session has expired. Please sign in again.' };
    }
    if (err.status === 403) {
      return { ok: false, kind: 'forbidden', speak: `${prefix} You do not have permission for that.` };
    }
    if (err.status === 404) {
      return { ok: false, kind: 'not_found', speak: `${prefix} I cannot find it.` };
    }
    return { ok: false, kind: 'error', speak: `${prefix} ${err.message}` };
  }
  return { ok: false, kind: 'error', speak: `${prefix} Something went wrong.` };
}

/** "REQ-0042, high, pending, June Harlow" collapsed to something worth hearing. */
function describe(row: VoiceRequirement): string {
  return `${row.code}, ${priorityLabel(row.priority)}, ${statusLabel(row.status)}, ${row.title}`;
}

const SPOKEN_ROW_LIMIT = 3;

function speakList(rows: VoiceRequirement[], subject: string): string {
  if (rows.length === 0) return `Nothing ${subject}.`;
  const head = rows.slice(0, SPOKEN_ROW_LIMIT).map(describe).join('. ');
  if (rows.length <= SPOKEN_ROW_LIMIT) {
    return `${rows.length} ${rows.length === 1 ? 'ticket' : 'tickets'} ${subject}. ${head}.`;
  }
  return `${rows.length} tickets ${subject}. The first three: ${head}. Ask me for more if you want the rest.`;
}

// --- The tools -------------------------------------------------------------------------

const listSchema: JsonSchema = {
  type: 'object',
  properties: {
    scope: {
      type: 'string',
      enum: ['mine', 'assigned_to_me', 'unassigned', 'all'],
      description: 'mine is what I filed, assigned_to_me is what is waiting on me, unassigned is the open queue',
    },
    status: { type: 'string', description: 'A status label, or outstanding for everything still live' },
    category: { type: 'string', description: 'A category label such as Software or Drive access' },
    priority: { type: 'string', description: 'Low, Medium, High or Urgent' },
    q: { type: 'string', description: 'Free text to search titles and descriptions' },
    limit: { type: 'integer', description: 'How many rows to fetch, 1 to 50. Defaults to 25' },
  },
  required: [],
  additionalProperties: false,
};

export interface ListRequirementsInput {
  scope?: string;
  status?: string;
  category?: string;
  priority?: string;
  q?: string;
  limit?: number;
}

export const listRequirementsTool: VoiceTool<ListRequirementsInput, { requirements: VoiceRequirement[] }> = {
  name: 'list_requirements',
  title: 'List tickets',
  description:
    'Call when the person asks what is waiting on them, what they filed, what is unassigned, or for any filtered list of tickets. Returns at most 25 rows, newest first.',
  kind: 'read',
  inputSchema: listSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(input, ctx) {
    const params = new URLSearchParams();
    if (input.scope) params.set('scope', input.scope);

    if (input.status) {
      const status = matchStatusFilter(input.status);
      if ('options' in status) {
        return { ok: false, kind: 'question', speak: `I do not know that status. Did you mean ${status.options.join(', ')}?` };
      }
      params.set('status', status.value);
    }
    if (input.category) {
      const category = matchCategory(input.category);
      if ('options' in category) {
        return { ok: false, kind: 'question', speak: `Which category did you mean? The options are ${category.options.join(', ')}.` };
      }
      params.set('category', category.value);
    }
    if (input.priority) {
      const priority = matchPriority(input.priority);
      if ('options' in priority) {
        return { ok: false, kind: 'question', speak: `Which priority did you mean? ${priority.options.join(', ')}.` };
      }
      params.set('priority', priority.value);
    }
    if (input.q) params.set('q', input.q);
    params.set('limit', String(Math.min(50, Math.max(1, Math.trunc(input.limit ?? 25)))));

    try {
      const res = await ctx.fetchJson<{ requirements: VoiceRequirement[] }>(`/api/requirements?${params.toString()}`);
      const rows = res.requirements ?? [];
      const subject =
        input.scope === 'assigned_to_me'
          ? 'waiting on you'
          : input.scope === 'mine'
            ? 'you filed'
            : input.scope === 'unassigned'
              ? 'in the unassigned queue'
              : 'match that';
      return { ok: true, data: { requirements: rows }, speak: speakList(rows, subject) };
    } catch (err) {
      return apiFailure(err, 'I could not fetch that list.');
    }
  },
};

const getRequirementSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'The ticket code, for example REQ-0042 or just 42' },
  },
  required: ['code'],
  additionalProperties: false,
};

export interface GetRequirementInput {
  code: string;
}

export interface GetRequirementOutput {
  requirement: VoiceRequirement;
  events: VoiceEvent[];
}

export const getRequirementTool: VoiceTool<GetRequirementInput, GetRequirementOutput> = {
  name: 'get_requirement',
  title: 'Open a ticket',
  description:
    'Call when the person names a ticket by code and wants its detail, history or status. Resolves the code to the ticket and returns it with its timeline.',
  kind: 'read',
  inputSchema: getRequirementSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(input, ctx) {
    const resolved = await resolveCode(ctx, input.code);
    if ('error' in resolved) return resolved.error;

    try {
      const res = await ctx.fetchJson<{ requirement: VoiceRequirement; events: VoiceEvent[] }>(
        `/api/requirements/${resolved.requirement.id}`,
      );
      const req = res.requirement;
      const who = req.assignee_name ? `with ${req.assignee_name}` : 'unassigned';
      return {
        ok: true,
        data: { requirement: req, events: res.events ?? [] },
        speak: `${req.code}, ${req.title}. ${statusLabel(req.status)}, ${priorityLabel(req.priority)} priority, ${who}. Filed by ${req.requester_name}.`,
      };
    } catch (err) {
      return apiFailure(err, `I could not open ${resolved.requirement.code}.`);
    }
  },
};

const noArgsSchema: JsonSchema = { type: 'object', properties: {}, required: [], additionalProperties: false };

export const getMyCountsTool: VoiceTool<Record<string, never>, VoiceCounts> = {
  name: 'get_my_counts',
  title: 'My counts',
  description:
    'Call when the person asks how much is on their plate, what is waiting on them, or how many of their own requests are still open.',
  kind: 'read',
  inputSchema: noArgsSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(_input, ctx) {
    try {
      const res = await ctx.fetchJson<{ counts: VoiceCounts }>('/api/auth/me');
      const counts = res.counts;
      return {
        ok: true,
        data: counts,
        speak: `${counts.assignedToMe} waiting on you, and ${counts.myOpenTickets} of your own requests still open.`,
      };
    } catch (err) {
      return apiFailure(err, 'I could not read your counts.');
    }
  },
};

const statsSchema: JsonSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', description: 'A status label, or outstanding for everything still live' },
    category: { type: 'string', description: 'A category label' },
    priority: { type: 'string', description: 'Low, Medium, High or Urgent' },
    from: { type: 'string', description: 'Start date as YYYY-MM-DD' },
    to: { type: 'string', description: 'End date as YYYY-MM-DD' },
  },
  required: [],
  additionalProperties: false,
};

export interface GetStatsInput {
  status?: string;
  category?: string;
  priority?: string;
  from?: string;
  to?: string;
}

export const getStatsTool: VoiceTool<GetStatsInput, VoiceKpis> = {
  name: 'get_stats',
  title: 'Queue numbers',
  description:
    'Call when the person asks for totals, how the queue is doing, how long things take to resolve, or any number rather than a list.',
  kind: 'read',
  inputSchema: statsSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(input, ctx) {
    const params = new URLSearchParams();
    if (input.status) {
      const status = matchStatusFilter(input.status);
      if ('options' in status) {
        return { ok: false, kind: 'question', speak: `I do not know that status. Did you mean ${status.options.join(', ')}?` };
      }
      params.set('status', status.value);
    }
    if (input.category) {
      const category = matchCategory(input.category);
      if ('options' in category) {
        return { ok: false, kind: 'question', speak: `Which category did you mean? The options are ${category.options.join(', ')}.` };
      }
      params.set('category', category.value);
    }
    if (input.priority) {
      const priority = matchPriority(input.priority);
      if ('options' in priority) {
        return { ok: false, kind: 'question', speak: `Which priority did you mean? ${priority.options.join(', ')}.` };
      }
      params.set('priority', priority.value);
    }
    if (input.from) params.set('from', input.from);
    if (input.to) params.set('to', input.to);

    try {
      const res = await ctx.fetchJson<{ stats: { kpis: VoiceKpis } }>(`/api/stats?${params.toString()}`);
      const kpis = res.stats.kpis;
      const avg =
        kpis.avgResolutionDays === null
          ? 'Nothing resolved yet in that range'
          : `Average time to resolve is ${kpis.avgResolutionDays.toFixed(1)} days`;
      return {
        ok: true,
        data: kpis,
        speak: `${kpis.total} tickets in total, ${kpis.outstanding} still outstanding and ${kpis.closed} closed. ${avg}.`,
      };
    } catch (err) {
      return apiFailure(err, 'I could not read the numbers.');
    }
  },
};

export const READ_TOOLS: readonly VoiceTool[] = [
  listRequirementsTool,
  getRequirementTool,
  getMyCountsTool,
  getStatsTool,
];
