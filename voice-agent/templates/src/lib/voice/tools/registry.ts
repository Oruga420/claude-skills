/**
 * The registry: one list, and the only door into it.
 *
 * Three things depend on this file staying the single source of truth. The WebMCP layer
 * registers what is here. The sync script generates the ElevenLabs agent definition from
 * exportRegistry(), so a tool name or a schema cannot drift between the page and the agent.
 * And runTool is the only call path the voice session has, so the role check below cannot be
 * skipped by a tool that forgets to make it.
 */

import { VIEW_TOOLS } from './navigate';
import { READ_TOOLS } from './read';
import { WRITE_TOOLS } from './write';
import { CONTROL_TOOLS } from './control';
import { TOUR_TOOLS } from './tour';
// EXAMPLE: add per-app tool files here (an admin.ts, a lifecycle.ts, whatever this app needs
// beyond view/read/write/tour) and spread their exported arrays into VOICE_TOOLS below, the
// same way WRITE_TOOLS and TOUR_TOOLS are. Nothing else in this file needs to change: the
// WebMCP registration, the sync script, and runTool all key off VOICE_TOOLS itself.
import {
  type ExportedRegistry,
  type ExportedTool,
  type JsonSchema,
  type ToolContext,
  type ToolResult,
  type VoiceRole,
  type VoiceTool,
} from './types';

const [navigateTool, setHistoryFiltersTool, setHomeFiltersTool, startNewRequirementTool] = VIEW_TOOLS;
const [listRequirementsTool, getRequirementTool, getMyCountsTool, getStatsTool] = READ_TOOLS;

/**
 * The whole clickable surface of the app, in this order: the three view commands, the four
 * reads, the form opener, the seven ticket writes, then this app's own additional tool files
 * (an admin.ts, a lifecycle.ts, or whatever else it needs; see the import comment above), and
 * finally the guided tour. Every clickable action is meant to work through the agent too, not
 * only the seven examples wired in here. A rule worth keeping from the app this template was
 * built from: the sync script counts this list, and a build-time assertion on that count turns
 * an added or removed tool into a deliberate, visible change rather than a silent drift between
 * the page and the agent. Permission mirrors live on each tool; toolsForRole is what the agent
 * actually receives.
 */
export const VOICE_TOOLS: readonly VoiceTool[] = [
  navigateTool,
  setHistoryFiltersTool,
  setHomeFiltersTool,
  listRequirementsTool,
  getRequirementTool,
  getMyCountsTool,
  getStatsTool,
  startNewRequirementTool,
  ...WRITE_TOOLS,
  ...TOUR_TOOLS,
  // ...ADMIN_TOOLS, ...LIFECYCLE_TOOLS, or whatever this app's own tool files export
];

export const VOICE_CONTROL_TOOLS: readonly VoiceTool[] = CONTROL_TOOLS;

const BY_NAME = new Map<string, VoiceTool>(
  [...VOICE_TOOLS, ...VOICE_CONTROL_TOOLS].map((tool) => [tool.name, tool]),
);

export function getTool(name: string): VoiceTool | undefined {
  return BY_NAME.get(name);
}

function roleAllowed(tool: VoiceTool, role: VoiceRole): boolean {
  return tool.allowedRoles === 'everyone' || tool.allowedRoles.includes(role);
}

/**
 * What this person's agent is told it can do. Offering a tool the route will refuse is worse
 * than not offering it: the person hears a plan, then a 403, in a channel with no back button.
 */
export function toolsForRole(role: VoiceRole): VoiceTool[] {
  return [...VOICE_TOOLS.filter((tool) => roleAllowed(tool, role)), ...VOICE_CONTROL_TOOLS];
}

/** Who to name in the refusal, per tool. Read off the route gates, not the repository ones. */
const WHO_CAN: Record<string, string> = {
  propose_take_requirement: 'Only an admin can take a ticket',
  propose_assign_requirement: 'Only an admin can assign a ticket',
  propose_set_status: 'Only an admin can change a ticket status',
  propose_add_subtask: 'Only an admin can add parts to a ticket',
};

function forbiddenResult(tool: VoiceTool): ToolResult<never> {
  const who = WHO_CAN[tool.name] ?? 'You do not have permission for that';
  return {
    ok: false,
    kind: 'forbidden',
    speak: `${who}. I can file a ticket or add a comment for you instead.`,
  };
}

// --- Input validation ------------------------------------------------------------------

/**
 * A small validator over the same JSON Schema objects the agent config carries, rather than a
 * parallel zod schema per tool. Two representations of one shape is how a registry drifts:
 * the agent would be told one thing and the page would enforce another.
 */
function validate(schema: JsonSchema, input: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'expected an object' };
  }
  const value = input as Record<string, unknown>;

  for (const key of schema.required ?? []) {
    const present = value[key];
    if (present === undefined || present === null || present === '') {
      return { ok: false, message: `${key} is required` };
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in schema.properties)) {
        return { ok: false, message: `${key} is not a field I know` };
      }
    }
  }

  for (const [key, raw] of Object.entries(value)) {
    const spec = schema.properties[key] as { type?: string; enum?: unknown[] } | undefined;
    if (!spec || raw === undefined || raw === null) continue;

    if (spec.type === 'string' && typeof raw !== 'string') {
      return { ok: false, message: `${key} should be text` };
    }
    if (spec.type === 'boolean' && typeof raw !== 'boolean') {
      return { ok: false, message: `${key} should be true or false` };
    }
    if ((spec.type === 'number' || spec.type === 'integer') && typeof raw !== 'number') {
      return { ok: false, message: `${key} should be a number` };
    }
    if (spec.type === 'integer' && typeof raw === 'number' && !Number.isInteger(raw)) {
      return { ok: false, message: `${key} should be a whole number` };
    }
    if (spec.enum && !spec.enum.includes(raw)) {
      return { ok: false, message: `${key} should be one of ${spec.enum.join(', ')}` };
    }
  }

  return { ok: true, value };
}

/**
 * The one entry point. Validates, enforces the role gate, dispatches, and turns any throw
 * into a spoken sentence, because an unhandled rejection leaves the agent silent mid call.
 */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, kind: 'error', speak: 'I do not have a way to do that yet.' };
  }

  if (!roleAllowed(tool, ctx.user.role)) {
    return forbiddenResult(tool);
  }

  const checked = validate(tool.inputSchema, input ?? {});
  if (!checked.ok) {
    return { ok: false, kind: 'question', speak: `I am missing something: ${checked.message}. Can you say that again?` };
  }

  try {
    return await tool.execute(checked.value, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong';
    return { ok: false, kind: 'error', speak: `That did not work. ${message}` };
  }
}

// --- Export for the sync script --------------------------------------------------------

function exportTool(tool: VoiceTool): ExportedTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    expectsResponse: tool.expectsResponse,
    responseTimeoutSecs: tool.responseTimeoutSecs,
    kind: tool.kind,
  };
}

/** Pure data, no functions, so scripts/sync-voice-agent.ts can serialise it straight to JSON. */
export function exportRegistry(): ExportedRegistry {
  return {
    tools: VOICE_TOOLS.map(exportTool),
    controlTools: VOICE_CONTROL_TOOLS.map(exportTool),
  };
}
