/**
 * The two control tools. They are not part of the 14: they never appear in a tool table, and
 * every role has them, because stopping something is not a privilege.
 *
 * confirm_action arms a pending proposal. It does NOT execute it, and it does NOT start the
 * three second stop window either: arming only records the yes. The window itself starts once
 * the agent actually finishes speaking the warning sentence below (VoiceCall's onModeChange
 * calls confirm.ts's startCountdown when the SDK reports the agent stopped talking), or right
 * away if the person confirmed by clicking instead of speaking. Only when that window runs out
 * does confirm.ts mint a token and call the executor. That ordering is the whole safety
 * property: between the person hearing the warning and anything reaching a route, there is a
 * window in which one word cancels it.
 */

import {
  DEFAULT_RESPONSE_TIMEOUT_SECS,
  type JsonSchema,
  type ToolResult,
  type VoiceTool,
} from './types';

const confirmSchema: JsonSchema = {
  type: 'object',
  properties: {
    proposal_id: { type: 'string', description: 'The proposal id the propose tool returned' },
    confirmation_text: {
      type: 'string',
      description: 'What the person actually said to approve it, word for word',
    },
  },
  required: ['proposal_id', 'confirmation_text'],
  additionalProperties: false,
};

export interface ConfirmActionInput {
  proposal_id: string;
  confirmation_text: string;
}

export const confirmActionTool: VoiceTool<ConfirmActionInput, { armed: true }> = {
  name: 'confirm_action',
  title: 'Confirm',
  description:
    'Call the moment the person approves what you read back to them. Pass their own words as the confirmation. It arms the action; the stop window during which they can still say stop starts once you finish speaking your reply, not before.',
  kind: 'control',
  inputSchema: confirmSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: false, consequentialHint: true },
  async execute(input, ctx) {
    const text = String(input.confirmation_text ?? '').trim();
    const armed = ctx.confirm.arm(input.proposal_id, text);
    if (armed === null) {
      const state = ctx.confirm.getState();
      if (state && state.proposalId === input.proposal_id) {
        return {
          ok: false,
          kind: 'error',
          speak:
            state.state === 'stopped'
              ? 'That one was already stopped. Tell me again and I will set it up fresh.'
              : 'That one is no longer waiting on a yes.',
        };
      }
      return {
        ok: false,
        kind: 'not_found',
        speak: 'I have nothing waiting on a yes right now. Tell me what you want and I will set it up.',
      };
    }

    // The window has not started yet: it starts the moment this sentence finishes playing
    // (VoiceCall's onModeChange), so it is never cut short by its own warning.
    const result: ToolResult<{ armed: true }> = {
      ok: true,
      data: { armed: true },
      speak: 'Filing it as soon as I finish talking; say stop to cancel.',
    };
    return result;
  },
};

const stopSchema: JsonSchema = {
  type: 'object',
  properties: {
    proposal_id: { type: 'string', description: 'The proposal id to cancel' },
  },
  required: ['proposal_id'],
  additionalProperties: false,
};

export interface StopActionInput {
  proposal_id: string;
}

export const stopActionTool: VoiceTool<StopActionInput, { state: string }> = {
  name: 'stop_action',
  title: 'Stop',
  description:
    'Call the instant the person says stop, cancel, wait, or changes their mind about something on screen. Drops the pending action.',
  kind: 'control',
  inputSchema: stopSchema,
  expectsResponse: true,
  responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
  allowedRoles: 'everyone',
  annotations: { readOnlyHint: false, consequentialHint: false },
  async execute(input, ctx) {
    const snapshot = ctx.confirm.stop(input.proposal_id);
    if (snapshot === null) {
      return { ok: false, kind: 'not_found', speak: 'There is nothing pending to stop.' };
    }
    if (snapshot.state === 'stopped') {
      return { ok: true, data: { state: snapshot.state }, speak: 'Stopped. Nothing was sent.' };
    }
    // Executing or later: the write already left. Saying "stopped" here would be a lie.
    return {
      ok: true,
      data: { state: snapshot.state },
      speak: 'That one already went through. I can cancel or comment on it if you want to undo it.',
    };
  },
};

export const CONTROL_TOOLS: readonly VoiceTool[] = [
  confirmActionTool,
  stopActionTool,
];
