/**
 * EXAMPLE: replace with your app's own view/navigation tools.
 *
 * The three view tools. They move the page, they never touch data.
 *
 * All three go out through the existing view command bus in src/lib/events.ts, which is the
 * one channel an open client already listens on. They are `expectsResponse: true` like every
 * other tool, because the agent still has to say where it took the person; a silent navigate
 * is disorienting when the only feedback channel is audio.
 */

import {
  DEFAULT_RESPONSE_TIMEOUT_SECS,
  type JsonSchema,
  type ToolResult,
  type VoiceTool,
} from './types';
import {
  matchCategory,
  matchPriority,
  matchStatusFilter,
  normalizeCode,
  resolveCode,
  categoryLabel,
} from './read';
import { resolveDateRange } from '../dates';

/** The four places the rail can reach. A ticket code is the fifth destination. */
const NAMED_DESTINATIONS: Record<string, { path: string; spoken: string }> = {
  home: { path: '/', spoken: 'Home' },
  history: { path: '/history', spoken: 'History' },
  admin: { path: '/admin', spoken: 'Admin' },
};

/**
 * Mirrors the TABS array in src/components/admin/AdminDashboard.tsx. Kept here rather than
 * imported because that file is a client component and this one runs in the tool layer; the
 * four keys are small and stable enough that duplicating them beats a cross-layer import.
 */
const ADMIN_TAB_LABELS: Record<string, string> = {
  users: 'Users',
  routing: 'Auto-routing',
  owners: 'Software owners',
  data: 'Data',
};

const navigateSchema: JsonSchema = {
  type: 'object',
  properties: {
    destination: {
      type: 'string',
      description: 'home, history, admin, or a ticket code such as REQ-0042',
    },
    tab: {
      type: 'string',
      description: 'Admin only: which tab to open, users, routing, owners, or data',
    },
  },
  required: ['destination'],
  additionalProperties: false,
};

export interface NavigateInput {
  destination: string;
  tab?: string;
}

export const navigateTool: VoiceTool<NavigateInput, { path: string }> = {
  name: 'navigate',
  title: 'Go somewhere',
  description:
    'Call when the person asks to be taken to Home, History, Admin, or to a specific ticket by code. For Admin, an optional tab (users, routing, owners, data) opens straight onto that section. Moves the page under them; it changes nothing.',
  kind: 'view',
  inputSchema: navigateSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(input, ctx) {
    const raw = String(input.destination ?? '').trim().toLowerCase();
    const named = NAMED_DESTINATIONS[raw];
    if (named) {
      // Admin is a rail item only admins are shown; sending anyone else there would land
      // them on a page that refuses them, so the refusal is spoken here instead.
      if (raw === 'admin' && ctx.user.role !== 'admin') {
        return {
          ok: false,
          kind: 'forbidden',
          speak: 'Admin is only open to admins. I can show you History instead.',
        };
      }

      let path: string = named.path;
      let spokenTab = '';
      if (raw === 'admin' && input.tab) {
        const tabKey = String(input.tab).trim().toLowerCase();
        const label = ADMIN_TAB_LABELS[tabKey];
        if (!label) {
          return {
            ok: false,
            kind: 'question',
            speak: 'Which admin tab did you mean? I can open users, auto-routing, software owners, or data.',
          };
        }
        path = `${named.path}?tab=${tabKey}`;
        spokenTab = `, on ${label}`;
      }

      ctx.dispatchViewCommand({ navigate: path });
      return { ok: true, data: { path }, speak: `Here is ${named.spoken}${spokenTab}.` };
    }

    if (normalizeCode(raw) === null) {
      return {
        ok: false,
        kind: 'question',
        speak: 'Where would you like to go? I can take you to Home, History, Admin, or a ticket by its code.',
      };
    }

    const resolved = await resolveCode(ctx, input.destination);
    if ('error' in resolved) return resolved.error;

    const path = `/requirements/${resolved.requirement.id}`;
    ctx.dispatchViewCommand({ navigate: path });
    return {
      ok: true,
      data: { path },
      speak: `Opening ${resolved.requirement.code}, ${resolved.requirement.title}.`,
    };
  },
};

const filtersSchema: JsonSchema = {
  type: 'object',
  properties: {
    scope: {
      type: 'string',
      enum: ['mine', 'assigned_to_me', 'unassigned', 'all'],
      description: 'Whose tickets to show',
    },
    status: { type: 'string', description: 'A status label, or outstanding for everything still live' },
    category: { type: 'string', description: 'A category label such as Software or Drive access' },
    priority: { type: 'string', description: 'Low, Medium, High or Urgent' },
    q: { type: 'string', description: 'Free text to search titles and descriptions' },
    from: { type: 'string', description: 'Start date as YYYY-MM-DD' },
    to: { type: 'string', description: 'End date as YYYY-MM-DD' },
    range: {
      type: 'string',
      description:
        'A relative or named date range instead of exact dates, such as last month, this week, last 7 days, this year, or since September 1',
    },
    include_subtasks: {
      type: 'boolean',
      description: 'Set true to also list subtasks alongside their parent tickets, false to hide them',
    },
    clear: { type: 'boolean', description: 'Set true to drop every filter and show everything' },
  },
  required: [],
  additionalProperties: false,
};

export interface SetHistoryFiltersInput {
  scope?: string;
  status?: string;
  category?: string;
  priority?: string;
  q?: string;
  from?: string;
  to?: string;
  range?: string;
  include_subtasks?: boolean;
  clear?: boolean;
}

/** Cleared filters travel as empty strings: the list schema preprocesses '' back to the default. */
const CLEARED_FILTERS: Record<string, unknown> = {
  scope: 'all',
  status: '',
  category: '',
  priority: '',
  q: '',
  from: '',
  to: '',
  include: '',
};

export const setHistoryFiltersTool: VoiceTool<SetHistoryFiltersInput, { filters: Record<string, unknown> }> = {
  name: 'set_history_filters',
  title: 'Filter History',
  description:
    'Call when the person wants History narrowed or widened: by scope, status, category, priority, a date range, a search term, or whether subtasks are listed alongside their parents. Set clear to true to drop every filter.',
  kind: 'view',
  inputSchema: filtersSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(input, ctx) {
    if (input.clear === true) {
      ctx.dispatchViewCommand({ navigate: '/history', filters: CLEARED_FILTERS });
      return { ok: true, data: { filters: CLEARED_FILTERS }, speak: 'Filters cleared, showing everything.' };
    }

    const filters: Record<string, unknown> = {};
    const spoken: string[] = [];

    if (input.scope) {
      filters.scope = input.scope;
      spoken.push(
        input.scope === 'assigned_to_me'
          ? 'waiting on you'
          : input.scope === 'mine'
            ? 'yours'
            : input.scope === 'unassigned'
              ? 'unassigned'
              : 'everything',
      );
    }
    if (input.status) {
      const status = matchStatusFilter(input.status);
      if ('options' in status) {
        return { ok: false, kind: 'question', speak: `I do not know that status. Did you mean ${status.options.join(', ')}?` };
      }
      filters.status = status.value;
      spoken.push(status.value === 'outstanding' ? 'still outstanding' : status.value.replace('_', ' '));
    }
    if (input.category) {
      const category = matchCategory(input.category);
      if ('options' in category) {
        return { ok: false, kind: 'question', speak: `Which category did you mean? The options are ${category.options.join(', ')}.` };
      }
      filters.category = category.value;
      spoken.push(categoryLabel(category.value));
    }
    if (input.priority) {
      const priority = matchPriority(input.priority);
      if ('options' in priority) {
        return { ok: false, kind: 'question', speak: `Which priority did you mean? ${priority.options.join(', ')}.` };
      }
      filters.priority = priority.value;
      spoken.push(`${priority.value} priority`);
    }
    if (input.q) {
      filters.q = input.q;
      spoken.push(`matching ${input.q}`);
    }
    if (input.from || input.to || input.range) {
      const resolved = resolveDateRange(
        { from: input.from, to: input.to, range: input.range },
        new Date(ctx.now()),
      );
      if (!resolved.from && !resolved.to) {
        return {
          ok: false,
          kind: 'question',
          speak:
            'I did not catch which dates you mean. You can say something like last month, this week, last 7 days, or since a specific date.',
        };
      }
      if (resolved.from) filters.from = resolved.from;
      if (resolved.to) filters.to = resolved.to;
      spoken.push(resolved.spoken);
    }
    if (input.include_subtasks !== undefined) {
      filters.include = input.include_subtasks ? 'subtasks' : '';
      spoken.push(input.include_subtasks ? 'including subtasks' : 'without subtasks');
    }

    if (Object.keys(filters).length === 0) {
      return {
        ok: false,
        kind: 'question',
        speak: 'What would you like me to filter by? I can use scope, status, category, priority, a search term or a date range.',
      };
    }

    ctx.dispatchViewCommand({ navigate: '/history', filters });
    return { ok: true, data: { filters }, speak: `History now shows ${spoken.join(', ')}.` };
  },
};

const homeFiltersSchema: JsonSchema = {
  type: 'object',
  properties: {
    category: { type: 'string', description: 'A category label such as Software or Drive access' },
    priority: { type: 'string', description: 'Low, Medium, High or Urgent' },
    q: { type: 'string', description: 'Free text to search titles and descriptions' },
    clear: { type: 'boolean', description: 'Set true to drop every filter and show everything' },
  },
  required: [],
  additionalProperties: false,
};

export interface SetHomeFiltersInput {
  category?: string;
  priority?: string;
  q?: string;
  clear?: boolean;
}

/** Cleared filters travel as empty strings, mirroring CLEARED_FILTERS above for History. */
const CLEARED_HOME_FILTERS: Record<string, unknown> = {
  category: '',
  priority: '',
  q: '',
};

/**
 * Home has no scope, status or date filters: it is two panels of what is already assigned
 * or open to the caller, narrowed only by category, priority and a search term (see
 * HomeClient's onViewCommand handler, which ignores everything else). This is the tool that
 * was missing when the agent was asked to filter the Home queue and it only read the
 * results back instead of acting on the page.
 */
export const setHomeFiltersTool: VoiceTool<SetHomeFiltersInput, { filters: Record<string, unknown> }> = {
  name: 'set_home_filters',
  title: 'Filter Home',
  description:
    'Call when the person wants the Home queue narrowed or widened: by category, priority or a search term. Set clear to true to drop every filter. Also brings them to Home if they are on a different page.',
  kind: 'view',
  inputSchema: homeFiltersSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(input, ctx) {
    if (input.clear === true) {
      ctx.dispatchViewCommand({ navigate: '/', filters: CLEARED_HOME_FILTERS });
      return { ok: true, data: { filters: CLEARED_HOME_FILTERS }, speak: 'Filters cleared, Home now shows everything.' };
    }

    const filters: Record<string, unknown> = {};
    const spoken: string[] = [];

    if (input.category) {
      const category = matchCategory(input.category);
      if ('options' in category) {
        return { ok: false, kind: 'question', speak: `Which category did you mean? The options are ${category.options.join(', ')}.` };
      }
      filters.category = category.value;
      spoken.push(categoryLabel(category.value));
    }
    if (input.priority) {
      const priority = matchPriority(input.priority);
      if ('options' in priority) {
        return { ok: false, kind: 'question', speak: `Which priority did you mean? ${priority.options.join(', ')}.` };
      }
      filters.priority = priority.value;
      spoken.push(`${priority.value} priority`);
    }
    if (input.q) {
      filters.q = input.q;
      spoken.push(`matching ${input.q}`);
    }

    if (Object.keys(filters).length === 0) {
      return {
        ok: false,
        kind: 'question',
        speak: 'What would you like me to filter by? I can use category, priority or a search term.',
      };
    }

    ctx.dispatchViewCommand({ navigate: '/', filters });
    return { ok: true, data: { filters }, speak: `Home now shows ${spoken.join(', ')}.` };
  },
};

const startNewSchema: JsonSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'Prefill the description field with this text' },
    category: { type: 'string', description: 'Prefill the category, by label' },
    priority: { type: 'string', description: 'Prefill the priority: Low, Medium, High or Urgent' },
  },
  required: [],
  additionalProperties: false,
};

export interface StartNewRequirementInput {
  description?: string;
  category?: string;
  priority?: string;
}

/**
 * Opens the form rather than filing anything, for the person who would rather see the fields
 * than hear them read back. The prefill travels in the query string because the modal is
 * component state inside HomeClient and the view command bus carries no field for it.
 */
export const startNewRequirementTool: VoiceTool<StartNewRequirementInput, { path: string }> = {
  name: 'start_new_requirement',
  title: 'Open the new ticket form',
  description:
    'Call when the person would rather fill the new ticket form themselves than dictate it. Opens the form prefilled with whatever they have already said. It files nothing.',
  kind: 'view',
  inputSchema: startNewSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: true, consequentialHint: false },
  async execute(input, ctx) {
    const params = new URLSearchParams({ new: '1' });
    const spoken: string[] = [];

    if (input.category) {
      const category = matchCategory(input.category);
      if ('options' in category) {
        return { ok: false, kind: 'question', speak: `Which category did you mean? The options are ${category.options.join(', ')}.` };
      }
      params.set('category', category.value);
      spoken.push(categoryLabel(category.value));
    }
    if (input.priority) {
      const priority = matchPriority(input.priority);
      if ('options' in priority) {
        return { ok: false, kind: 'question', speak: `Which priority did you mean? ${priority.options.join(', ')}.` };
      }
      params.set('priority', priority.value);
      spoken.push(`${priority.value} priority`);
    }
    if (input.description) {
      params.set('description', input.description);
      spoken.push(`"${input.description}"`);
    }

    const path = `/?${params.toString()}`;
    ctx.dispatchViewCommand({ navigate: path });
    const summary = spoken.length > 0 ? spoken.join(', ') : 'nothing yet, it is blank';
    const result: ToolResult<{ path: string }> = {
      ok: true,
      data: { path },
      speak: `The new ticket form is open. Fill in the rest and hit create. Right now it is prefilled with ${summary}.`,
    };
    return result;
  },
};

export const VIEW_TOOLS: readonly VoiceTool[] = [
  navigateTool,
  setHistoryFiltersTool,
  setHomeFiltersTool,
  startNewRequirementTool,
];
