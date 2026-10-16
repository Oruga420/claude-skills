/**
 * EXAMPLE: replace with your app's own consequential (propose_*) write tools.
 *
 * The seven consequential tools. Not one of them writes.
 *
 * Each resolves and validates everything the route will check, builds the exact body it will
 * send, hands that to the confirm store as a pending action, and returns at once with the
 * lines the overlay shows and a question for the agent to ask. The write happens later, from
 * confirm.ts, with a token the agent cannot mint. That split exists because the go-ahead has
 * to fit inside the tool's response timeout and a person taking eight seconds to think would
 * otherwise blow it.
 *
 * The permission mirror below is the ROUTE's gate, measured in the handler, not the
 * repository's. Where the two differ the route is narrower and runs first: the cancel route
 * uses canCancel (admin or requester) even though assertCanCancel would also let staff
 * through, and the comment route inlines admin-or-requester-or-assignee rather than calling
 * assertCanComment. Mirroring the repo instead would make the agent offer actions that come
 * back 403.
 */

import { isValidPair, subcategoryLabel, CATEGORIES } from '@/lib/format';
import type { PendingAction } from '../confirm';
import {
  DEFAULT_RESPONSE_TIMEOUT_SECS,
  type JsonSchema,
  type ToolContext,
  type ToolResult,
  type VoiceTool,
} from './types';
import {
  apiFailure,
  categoryLabel,
  matchCategory,
  matchPriority,
  priorityLabel,
  resolveCode,
  statusLabel,
  type VoiceRequirement,
} from './read';

/** What every propose_* tool answers with, so the overlay and the agent stay in step. */
export interface ProposalOutput {
  proposal_id: string;
  lines: string[];
}

type ProposeResult = ToolResult<ProposalOutput>;

const PROPOSE_TIMEOUT_SECS = DEFAULT_RESPONSE_TIMEOUT_SECS;

/** Statuses in which a ticket is finished, so nothing further can be done to it. */
const CLOSED_STATUSES = ['closed', 'cancelled'];

function raise(ctx: ToolContext, action: PendingAction, question: string): ProposeResult {
  const { proposalId } = ctx.confirm.propose(action);
  return {
    ok: true,
    data: { proposal_id: proposalId, lines: action.lines },
    speak: `${action.lines.join('. ')}. ${question}`,
  };
}

function requirementResultSpeak(result: unknown, verb: string): string {
  const req = (result as { requirement?: VoiceRequirement } | null)?.requirement;
  if (!req) return `${verb}. It went through.`;
  const who = req.assignee_name ? `It is with ${req.assignee_name}` : 'It is in the unassigned queue';
  return `${verb} ${req.code}. ${who}.`;
}

function navigateToRequirement(result: unknown): string | undefined {
  const req = (result as { requirement?: VoiceRequirement } | null)?.requirement;
  return req ? `/requirements/${req.id}` : undefined;
}

/** Shared first step for the six tools that act on an existing ticket. */
async function loadTarget(
  ctx: ToolContext,
  code: string,
): Promise<{ requirement: VoiceRequirement } | { error: ProposeResult }> {
  const resolved = await resolveCode(ctx, code);
  if ('error' in resolved) return { error: resolved.error as ProposeResult };
  return resolved;
}

// --- propose_create_requirement --------------------------------------------------------

const createSchema: JsonSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'What is needed, in the person own words. At least 3 characters' },
    category: { type: 'string', description: 'A category label such as Software, Hardware or Drive access' },
    subcategory: { type: 'string', description: 'Optional second level, by label. A category on its own is a complete answer' },
    priority: { type: 'string', description: 'Low, Medium, High or Urgent. Defaults to Medium' },
    needed_by: { type: 'string', description: 'Optional date the person needs it by, as YYYY-MM-DD' },
  },
  required: ['description', 'category'],
  additionalProperties: false,
};

export interface CreateRequirementInput {
  description: string;
  category: string;
  subcategory?: string;
  priority?: string;
  needed_by?: string;
}

export const proposeCreateRequirementTool: VoiceTool<CreateRequirementInput, ProposalOutput> = {
  name: 'propose_create_requirement',
  title: 'File a ticket',
  description:
    'Call when the person wants something filed and you have at least what they need and which category it belongs to. Raises the confirmation overlay and returns at once. It does not file anything until they say yes.',
  kind: 'consequential',
  inputSchema: createSchema,
  expectsResponse: true,
  responseTimeoutSecs: PROPOSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const description = String(input.description ?? '').trim();
    if (description.length < 3) {
      return { ok: false, kind: 'question', speak: 'Tell me a little more about what you need, and I will file it.' };
    }
    if (description.length > 5000) {
      return { ok: false, kind: 'question', speak: 'That is longer than a ticket can hold. Can you give me the short version?' };
    }

    const category = matchCategory(input.category ?? '');
    if ('options' in category) {
      return {
        ok: false,
        kind: 'question',
        speak: `Which category does this belong to? The options are ${category.options.join(', ')}.`,
      };
    }

    // Onboarding and offboarding have their own forms with fields voice cannot collect.
    if (category.value === 'onboarding' || category.value === 'offboarding') {
      return {
        ok: false,
        kind: 'forbidden',
        speak: `${categoryLabel(category.value)} has its own form with details I cannot take by voice. Open it from Home and I will stay with you.`,
      };
    }

    let subcategory: string | null = null;
    if (input.subcategory) {
      const wanted = String(input.subcategory).trim().toLowerCase();
      const parent = CATEGORIES.find((c) => c.value === category.value);
      const hit = parent?.children.find(
        (s) => s.value.toLowerCase() === wanted || s.label.toLowerCase() === wanted,
      );
      if (!hit) {
        const options = parent?.children.map((s) => s.label) ?? [];
        return {
          ok: false,
          kind: 'question',
          speak:
            options.length === 0
              ? `${categoryLabel(category.value)} has no sub options, so I will file it at the category level. Shall I?`
              : `Which kind of ${categoryLabel(category.value)} request is it? ${options.join(', ')}.`,
        };
      }
      subcategory = hit.value;
    }
    if (!isValidPair(category.value, subcategory)) {
      return { ok: false, kind: 'question', speak: 'That option does not belong to that category. Which one did you mean?' };
    }

    let priority = 'medium';
    if (input.priority) {
      const matched = matchPriority(input.priority);
      if ('options' in matched) {
        return { ok: false, kind: 'question', speak: `Which priority? ${matched.options.join(', ')}.` };
      }
      priority = matched.value;
    }

    if (input.needed_by && !/^\d{4}-\d{2}-\d{2}$/.test(input.needed_by)) {
      return { ok: false, kind: 'question', speak: 'What date do you need it by? Give me a day, a month and a year.' };
    }

    const lines = [
      `Category: ${categoryLabel(category.value)}`,
      ...(subcategory ? [`Kind: ${subcategoryLabel(category.value, subcategory) ?? subcategory}`] : []),
      `Priority: ${priorityLabel(priority)}`,
      ...(input.needed_by ? [`Needed by: ${input.needed_by}`] : []),
      `What you need: ${description}`,
    ];

    return raise(
      ctx,
      {
        toolName: 'propose_create_requirement',
        title: 'Creating ticket',
        lines,
        method: 'POST',
        path: '/api/requirements',
        body: {
          description,
          category: category.value,
          subcategory,
          priority,
          ...(input.needed_by ? { needed_by: input.needed_by } : {}),
        },
        onSuccessNavigate: navigateToRequirement,
        speakOnSuccess: (result) => requirementResultSpeak(result, 'Filed'),
      },
      'Shall I file it?',
    );
  },
};

// --- propose_take_requirement ----------------------------------------------------------

const codeOnlySchema: JsonSchema = {
  type: 'object',
  properties: { code: { type: 'string', description: 'The ticket code, for example REQ-0042' } },
  required: ['code'],
  additionalProperties: false,
};

export interface CodeOnlyInput {
  code: string;
}

export const proposeTakeRequirementTool: VoiceTool<CodeOnlyInput, ProposalOutput> = {
  name: 'propose_take_requirement',
  title: 'Take a ticket',
  description:
    'Call when an admin wants to claim a ticket for themselves. Raises the confirmation overlay; the ticket moves only after they say yes.',
  kind: 'consequential',
  inputSchema: codeOnlySchema,
  expectsResponse: true,
  responseTimeoutSecs: PROPOSE_TIMEOUT_SECS,
  allowedRoles: ['admin'],
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const target = await loadTarget(ctx, input.code);
    if ('error' in target) return target.error;
    const req = target.requirement;

    if (CLOSED_STATUSES.includes(req.status)) {
      return { ok: false, kind: 'forbidden', speak: `${req.code} is already ${statusLabel(req.status).toLowerCase()}, so there is nothing to take.` };
    }
    if (req.assignee_id === ctx.user.id) {
      return { ok: false, kind: 'forbidden', speak: `${req.code} is already yours.` };
    }

    const lines = [
      `Ticket: ${req.code}, ${req.title}`,
      ...(req.assignee_name ? [`Currently with: ${req.assignee_name}`] : ['Currently unassigned']),
      `New owner: you`,
    ];

    return raise(
      ctx,
      {
        toolName: 'propose_take_requirement',
        title: `Taking ${req.code}`,
        lines,
        method: 'POST',
        path: `/api/requirements/${req.id}/assign`,
        body: { assignee_id: ctx.user.id },
        onSuccessNavigate: navigateToRequirement,
        speakOnSuccess: (result) => requirementResultSpeak(result, 'You now own'),
      },
      'Shall I take it?',
    );
  },
};

// --- propose_assign_requirement --------------------------------------------------------

const assignSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'The ticket code, for example REQ-0042' },
    assignee: {
      type: 'string',
      description: 'Who to hand it to, by name or email. Say queue or unassigned to send it back to the queue',
    },
  },
  required: ['code', 'assignee'],
  additionalProperties: false,
};

export interface AssignRequirementInput {
  code: string;
  assignee: string;
}

interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export const proposeAssignRequirementTool: VoiceTool<AssignRequirementInput, ProposalOutput> = {
  name: 'propose_assign_requirement',
  title: 'Assign a ticket',
  description:
    'Call when an admin wants to hand a ticket to a named person, or send it back to the unassigned queue. Raises the confirmation overlay.',
  kind: 'consequential',
  inputSchema: assignSchema,
  expectsResponse: true,
  responseTimeoutSecs: PROPOSE_TIMEOUT_SECS,
  allowedRoles: ['admin'],
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const target = await loadTarget(ctx, input.code);
    if ('error' in target) return target.error;
    const req = target.requirement;

    if (CLOSED_STATUSES.includes(req.status)) {
      return { ok: false, kind: 'forbidden', speak: `${req.code} is already ${statusLabel(req.status).toLowerCase()}, so it cannot be reassigned.` };
    }

    const wanted = String(input.assignee ?? '').trim().toLowerCase();
    if (wanted.length === 0) {
      return { ok: false, kind: 'question', speak: 'Who should I hand it to?' };
    }

    let assigneeId: number | null = null;
    let assigneeName = 'the unassigned queue';

    if (wanted === 'queue' || wanted === 'unassigned' || wanted === 'nobody' || wanted === 'no one') {
      assigneeId = null;
    } else {
      let staff: StaffUser[];
      try {
        // The unfiltered list is active staff only, which is exactly the assignable pool the
        // route will accept. Anyone else is a question, never a guess.
        const res = await ctx.fetchJson<{ users: StaffUser[] }>('/api/users');
        staff = res.users ?? [];
      } catch (err) {
        return apiFailure(err, 'I could not read the list of people.') as ProposeResult;
      }

      const exact = staff.filter(
        (u) => u.name.toLowerCase() === wanted || u.email.toLowerCase() === wanted,
      );
      const partial = staff.filter((u) => u.name.toLowerCase().includes(wanted));
      const matches = exact.length > 0 ? exact : partial;

      if (matches.length === 0) {
        return {
          ok: false,
          kind: 'not_found',
          speak: `I cannot find anyone on the team called ${input.assignee}. Who did you mean?`,
        };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          kind: 'question',
          speak: `There is more than one ${input.assignee}: ${matches.map((u) => u.name).join(', ')}. Which one?`,
        };
      }
      assigneeId = matches[0].id;
      assigneeName = matches[0].name;
    }

    if (assigneeId !== null && assigneeId === req.assignee_id) {
      return { ok: false, kind: 'forbidden', speak: `${req.code} is already with ${assigneeName}.` };
    }

    const lines = [
      `Ticket: ${req.code}, ${req.title}`,
      ...(req.assignee_name ? [`Currently with: ${req.assignee_name}`] : ['Currently unassigned']),
      `Assigning to: ${assigneeName}`,
    ];

    return raise(
      ctx,
      {
        toolName: 'propose_assign_requirement',
        title: `Assigning ${req.code}`,
        lines,
        method: 'POST',
        path: `/api/requirements/${req.id}/assign`,
        body: { assignee_id: assigneeId },
        onSuccessNavigate: navigateToRequirement,
        speakOnSuccess: (result) => requirementResultSpeak(result, 'Assigned'),
      },
      `Shall I hand it to ${assigneeName}?`,
    );
  },
};

// --- propose_set_status ----------------------------------------------------------------

const statusSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'The ticket code, for example REQ-0042' },
    status: {
      type: 'string',
      description: 'Where the ticket should go: Pending to reopen or start over, In progress, On hold, or Closed',
    },
    note: { type: 'string', description: 'What was done. Required when closing a ticket' },
  },
  required: ['code', 'status'],
  additionalProperties: false,
};

export interface SetStatusInput {
  code: string;
  status: string;
  note?: string;
}

/** Cancelled is reachable only through the cancel route, so it is not offered here. */
const SETTABLE_STATUSES = ['pending', 'in_progress', 'on_hold', 'closed'];

export const proposeSetStatusTool: VoiceTool<SetStatusInput, ProposalOutput> = {
  name: 'propose_set_status',
  title: 'Move a ticket',
  description:
    'Call when an admin wants to start a ticket, put it on hold, close it out, or reopen it. Closing needs a note saying what was done. Raises the confirmation overlay.',
  kind: 'consequential',
  inputSchema: statusSchema,
  expectsResponse: true,
  responseTimeoutSecs: PROPOSE_TIMEOUT_SECS,
  allowedRoles: ['admin'],
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const target = await loadTarget(ctx, input.code);
    if ('error' in target) return target.error;
    const req = target.requirement;

    const wanted = String(input.status ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    const alias: Record<string, string> = {
      start: 'in_progress',
      started: 'in_progress',
      working: 'in_progress',
      in_progress: 'in_progress',
      hold: 'on_hold',
      on_hold: 'on_hold',
      paused: 'on_hold',
      close: 'closed',
      closed: 'closed',
      done: 'closed',
      resolve: 'closed',
      resolved: 'closed',
      reopen: 'pending',
      reopened: 'pending',
      pending: 'pending',
    };
    const status = alias[wanted];
    if (!status || !SETTABLE_STATUSES.includes(status)) {
      return {
        ok: false,
        kind: 'question',
        speak: 'Where should it go? I can start it, put it on hold, close it, or reopen it.',
      };
    }

    if (req.status === status) {
      return { ok: false, kind: 'forbidden', speak: `${req.code} is already ${statusLabel(status).toLowerCase()}.` };
    }
    // Everything except reopening is refused on a finished ticket, the same way canWorkOn does.
    if (CLOSED_STATUSES.includes(req.status) && status !== 'pending') {
      return {
        ok: false,
        kind: 'forbidden',
        speak: `${req.code} is already ${statusLabel(req.status).toLowerCase()}. I can reopen it first if you want.`,
      };
    }

    const note = input.note ? String(input.note).trim() : '';
    if (status === 'closed' && note.length === 0) {
      return {
        ok: false,
        kind: 'question',
        speak: 'What was done to resolve it? The app will not close a ticket without a note.',
      };
    }
    if (note.length > 2000) {
      return { ok: false, kind: 'question', speak: 'That note is too long for this app. Can you shorten it?' };
    }

    const lines = [
      `Ticket: ${req.code}, ${req.title}`,
      `From: ${statusLabel(req.status)}`,
      `To: ${statusLabel(status)}`,
      ...(note ? [`Note: ${note}`] : []),
    ];

    const titleVerb =
      status === 'closed' ? 'Closing' : status === 'on_hold' ? 'Holding' : status === 'pending' ? 'Reopening' : 'Starting';

    return raise(
      ctx,
      {
        toolName: 'propose_set_status',
        title: `${titleVerb} ${req.code}`,
        lines,
        method: 'POST',
        path: `/api/requirements/${req.id}/status`,
        body: { status, ...(note ? { note } : {}) },
        onSuccessNavigate: navigateToRequirement,
        speakOnSuccess: (result) => requirementResultSpeak(result, `${statusLabel(status)} is now the status of`),
      },
      `Shall I ${titleVerb.toLowerCase().replace(/ing$/, '')} it?`,
    );
  },
};

// --- propose_cancel_requirement --------------------------------------------------------

const cancelSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'The ticket code, for example REQ-0042' },
    note: { type: 'string', description: 'Optional reason for withdrawing it' },
  },
  required: ['code'],
  additionalProperties: false,
};

export interface CancelRequirementInput {
  code: string;
  note?: string;
}

export const proposeCancelRequirementTool: VoiceTool<CancelRequirementInput, ProposalOutput> = {
  name: 'propose_cancel_requirement',
  title: 'Cancel a ticket',
  description:
    'Call when the person wants to withdraw a request. They can cancel their own; an admin can cancel any. Raises the confirmation overlay.',
  kind: 'consequential',
  inputSchema: cancelSchema,
  expectsResponse: true,
  responseTimeoutSecs: PROPOSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const target = await loadTarget(ctx, input.code);
    if ('error' in target) return target.error;
    const req = target.requirement;

    if (CLOSED_STATUSES.includes(req.status)) {
      return {
        ok: false,
        kind: 'forbidden',
        speak: `${req.code} is already ${statusLabel(req.status).toLowerCase()}, so there is nothing to cancel.`,
      };
    }
    // The route's own gate is canCancel: an admin, or the person who filed it. Being the
    // assignee is not enough, which is why this does not check assignee_id.
    const allowed = ctx.user.role === 'admin' || ctx.user.id === req.requester_id;
    if (!allowed) {
      return {
        ok: false,
        kind: 'forbidden',
        speak: `Only ${req.requester_name}, who filed ${req.code}, or an admin can cancel it. I can add a comment for you instead.`,
      };
    }

    const note = input.note ? String(input.note).trim().slice(0, 2000) : '';
    const lines = [
      `Ticket: ${req.code}, ${req.title}`,
      `Filed by: ${req.requester_name}`,
      ...(note ? [`Reason: ${note}`] : []),
      'This withdraws the request',
    ];

    return raise(
      ctx,
      {
        toolName: 'propose_cancel_requirement',
        title: `Cancelling ${req.code}`,
        lines,
        method: 'POST',
        path: `/api/requirements/${req.id}/cancel`,
        // The note is optional in the body on purpose: the route ignores it today and reads
        // it once phase 1.5 lands, so sending it early is harmless either way.
        body: note ? { note } : {},
        onSuccessNavigate: navigateToRequirement,
        speakOnSuccess: (result) => requirementResultSpeak(result, 'Cancelled'),
      },
      'Shall I cancel it?',
    );
  },
};

// --- propose_add_comment ---------------------------------------------------------------

const commentSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'The ticket code, for example REQ-0042' },
    note: { type: 'string', description: 'What to add to the ticket timeline. 1 to 2000 characters' },
  },
  required: ['code', 'note'],
  additionalProperties: false,
};

export interface AddCommentInput {
  code: string;
  note: string;
}

export const proposeAddCommentTool: VoiceTool<AddCommentInput, ProposalOutput> = {
  name: 'propose_add_comment',
  title: 'Comment on a ticket',
  description:
    'Call when the person wants to add something to a ticket timeline: an update, a question, a correction. Works on tickets they filed, tickets assigned to them, or any ticket for an admin.',
  kind: 'consequential',
  inputSchema: commentSchema,
  expectsResponse: true,
  responseTimeoutSecs: PROPOSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const target = await loadTarget(ctx, input.code);
    if ('error' in target) return target.error;
    const req = target.requirement;

    // The comment route inlines admin or requester or assignee. An agent who is not the
    // assignee is refused there, so the agent must not offer it here.
    const allowed =
      ctx.user.role === 'admin' || ctx.user.id === req.requester_id || ctx.user.id === req.assignee_id;
    if (!allowed) {
      return {
        ok: false,
        kind: 'forbidden',
        speak: `Only ${req.requester_name}, whoever it is assigned to, or an admin can comment on ${req.code}.`,
      };
    }

    const note = String(input.note ?? '').trim();
    if (note.length === 0) {
      return { ok: false, kind: 'question', speak: 'What would you like the comment to say?' };
    }
    if (note.length > 2000) {
      return { ok: false, kind: 'question', speak: 'That comment is too long for this app. Can you shorten it?' };
    }

    const lines = [`Ticket: ${req.code}, ${req.title}`, `Comment: ${note}`];

    return raise(
      ctx,
      {
        toolName: 'propose_add_comment',
        title: 'Adding your comment',
        lines,
        method: 'POST',
        path: `/api/requirements/${req.id}/comment`,
        body: { note },
        onSuccessNavigate: navigateToRequirement,
        speakOnSuccess: (result) => requirementResultSpeak(result, 'Added your comment to'),
      },
      'Shall I add it?',
    );
  },
};

// --- propose_add_subtask ---------------------------------------------------------------

const subtaskSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'The parent ticket code, for example REQ-0042' },
    title: { type: 'string', description: 'What the subtask is. 3 to 200 characters' },
    description: { type: 'string', description: 'Optional detail' },
    priority: { type: 'string', description: 'Low, Medium, High or Urgent. Inherits the parent when left out' },
  },
  required: ['code', 'title'],
  additionalProperties: false,
};

export interface AddSubtaskInput {
  code: string;
  title: string;
  description?: string;
  priority?: string;
}

interface SubtaskResult {
  subtasks?: Array<{ code: string; title: string }>;
}

export const proposeAddSubtaskTool: VoiceTool<AddSubtaskInput, ProposalOutput> = {
  name: 'propose_add_subtask',
  title: 'Add a subtask',
  description:
    'Call when an admin wants to break a ticket into parts and add one of them. One subtask per call. Raises the confirmation overlay.',
  kind: 'consequential',
  inputSchema: subtaskSchema,
  expectsResponse: true,
  responseTimeoutSecs: PROPOSE_TIMEOUT_SECS,
  allowedRoles: ['admin'],
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const target = await loadTarget(ctx, input.code);
    if ('error' in target) return target.error;
    const req = target.requirement;

    if (req.parent_id !== null) {
      return {
        ok: false,
        kind: 'forbidden',
        speak: `${req.code} is already a subtask of ${req.parent_code}, and the app does not nest them further.`,
      };
    }
    if (CLOSED_STATUSES.includes(req.status)) {
      return { ok: false, kind: 'forbidden', speak: `${req.code} is already ${statusLabel(req.status).toLowerCase()}, so it takes no new parts.` };
    }

    const title = String(input.title ?? '').trim();
    if (title.length < 3) {
      return { ok: false, kind: 'question', speak: 'What should the subtask be called?' };
    }
    if (title.length > 200) {
      return { ok: false, kind: 'question', speak: 'That subtask title is too long. Can you give me a shorter one?' };
    }

    let priority: string | undefined;
    if (input.priority) {
      const matched = matchPriority(input.priority);
      if ('options' in matched) {
        return { ok: false, kind: 'question', speak: `Which priority? ${matched.options.join(', ')}.` };
      }
      priority = matched.value;
    }

    const description = input.description ? String(input.description).trim().slice(0, 5000) : undefined;

    const lines = [
      `Parent: ${req.code}, ${req.title}`,
      `Subtask: ${title}`,
      ...(description ? [`Detail: ${description}`] : []),
      ...(priority ? [`Priority: ${priorityLabel(priority)}`] : []),
    ];

    return raise(
      ctx,
      {
        toolName: 'propose_add_subtask',
        title: `Adding a part to ${req.code}`,
        lines,
        method: 'POST',
        path: `/api/requirements/${req.id}/subtasks`,
        body: {
          items: [
            {
              title,
              ...(description ? { description } : {}),
              ...(priority ? { priority } : {}),
            },
          ],
        },
        onSuccessNavigate: () => `/requirements/${req.id}`,
        speakOnSuccess: (result) => {
          const first = (result as SubtaskResult | null)?.subtasks?.[0];
          return first ? `Added ${first.code}, ${first.title}.` : `Added the subtask to ${req.code}.`;
        },
      },
      'Shall I add it?',
    );
  },
};

export const WRITE_TOOLS: readonly VoiceTool[] = [
  proposeCreateRequirementTool,
  proposeTakeRequirementTool,
  proposeAssignRequirementTool,
  proposeSetStatusTool,
  proposeCancelRequirementTool,
  proposeAddCommentTool,
  proposeAddSubtaskTool,
];
