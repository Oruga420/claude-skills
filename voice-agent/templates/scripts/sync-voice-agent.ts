import { writeFileSync } from 'node:fs';
import { exportRegistry } from '../src/lib/voice/tools/registry';
import { VOICE_PERSONA, VOICE_FIRST_MESSAGE, type PersonaVariables } from '../src/lib/voice/persona';

/**
 * Agent config as code (Phase 1.6 of ultraplan-voice-agent.html).
 *
 * Generates the ElevenLabs agent's tool definitions and persona from the same registry
 * the app registers on WebMCP, so the two cannot drift. Three modes:
 *
 *   --dry-run --out <file>   Writes the generated config to a JSON file. No network call.
 *   --create                 POSTs a new private agent (default name below) and prints its agent id.
 *   --push                   PATCHes the real agent through the ElevenLabs Agents API.
 *   --probe                  Runs the Phase 0.1 ten-turn text probe against the live agent.
 *
 * Never logs or writes the ELEVENLABS_API_KEY value anywhere.
 */

interface RegistryToolDef {
  name: string;
  description: string;
  inputSchema: object;
  expectsResponse: boolean;
  responseTimeoutSecs: number;
  kind: string;
}

interface RegistryExport {
  tools: RegistryToolDef[];
  controlTools: RegistryToolDef[];
}

interface ClientToolPayload {
  type: 'client';
  name: string;
  description: string;
  expects_response: boolean;
  response_timeout_secs: number;
  parameters: object;
}

/**
 * The vendor's parameters schema is a strict subset of JSON Schema: measured 2026-09-22 on the
 * first real create, `additionalProperties` anywhere in a tool's parameters answers 422
 * "Extra inputs are not permitted". The registry keeps that key (the in-page validator uses
 * it), so it is stripped here, recursively, only for the payload sent to ElevenLabs.
 */
function stripForVendor(schema: unknown, fallbackDescription = 'Value'): unknown {
  if (Array.isArray(schema)) return schema.map((s) => stripForVendor(s, fallbackDescription));
  if (schema && typeof schema === 'object') {
    const src = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      if (key === 'additionalProperties') continue;
      if (key === 'properties' && value && typeof value === 'object') {
        // Each property carries its own name as the fallback description.
        const props: Record<string, unknown> = {};
        for (const [name, sub] of Object.entries(value as Record<string, unknown>)) {
          props[name] = stripForVendor(sub, name.replace(/_/g, ' '));
        }
        out[key] = props;
        continue;
      }
      if (key === 'items') {
        out[key] = stripForVendor(value, `One ${fallbackDescription}`);
        continue;
      }
      out[key] = stripForVendor(value, fallbackDescription);
    }
    // Measured 2026-09-23 on the first real push: every typed node, array items included, must
    // carry a description ("Must set one of: description, dynamic_variable, ..."), or the whole
    // agent update is rejected with 400.
    if (typeof out.type === 'string' && !('description' in out)) out.description = fallbackDescription;
    return out;
  }
  return schema;
}

function toClientTool(tool: RegistryToolDef): ClientToolPayload {
  return {
    type: 'client',
    name: tool.name,
    description: tool.description,
    expects_response: tool.expectsResponse,
    response_timeout_secs: tool.responseTimeoutSecs,
    parameters: stripForVendor(tool.inputSchema) as ClientToolPayload['parameters'],
  };
}

/**
 * Base client events, from the documented `conversation_config.conversation.client_events`
 * enum (ElevenLabs Agents Platform API reference, fetched 2026-09-22): everything a text/audio
 * transcript UI needs, minus the two debug-only values (`ping`, `vad_score`) this app has no
 * use for. `interruption` is NOT in the vendor's own default list and is added explicitly here
 * per Phase 0.1, since the overlay's Stop button depends on the client seeing it.
 */
const BASE_CLIENT_EVENTS = ['audio', 'user_transcript', 'agent_response', 'agent_response_correction', 'client_tool_call'];

function clientEventsWithInterruption(): string[] {
  return [...BASE_CLIENT_EVENTS, 'interruption'];
}

/**
 * Fallback text for every {{placeholder}} in VOICE_PERSONA and VOICE_FIRST_MESSAGE, keyed to
 * PersonaVariables exactly (a `Record<keyof PersonaVariables, string>` catches a renamed or
 * dropped key at compile time). Declared via `conversation_config.agent.dynamic_variables.
 * dynamic_variable_placeholders` (ElevenLabs Agents Platform dynamic-variables doc, fetched
 * 2026-09-22) so a call that somehow starts before the token route's real values are wired in
 * renders plain words instead of a literal unfilled "{{name}}" in the person's ear.
 */
const DYNAMIC_VARIABLE_DEFAULTS: Record<keyof PersonaVariables, string> = {
  name: 'there',
  email: 'unknown',
  role: 'member',
  today: 'today',
  localTime: 'now',
  isAdmin: 'no',
  canDo: 'read the queue and file a ticket',
  assignedToMe: '0',
  myOpenTickets: '0',
};

/** The dry-run / --out JSON shape. Flat and simplified on purpose: this is a build artifact
 * meant for a human to skim and for a CI assertion to count tools against, not the literal
 * ElevenLabs request body (see buildPushBody for that; the two are intentionally different
 * shapes because the vendor's schema is deeply nested under conversation_config.agent.prompt.*
 * while this file is meant to be skimmed). */
function buildDryRunConfig(registry: RegistryExport) {
  return {
    agent: {
      name: 'Assistant',
      // NOTE, uncertainty flagged per the plan: the ElevenLabs model enum observed in its docs
      // (fetched 2026-09-22) lists examples like "claude-sonnet-4-5", not "claude-sonnet-5".
      // The vendor may not have an enum entry for Sonnet 5 yet. Verify the live dropdown in the
      // ElevenLabs agent settings before --push is ever run against a real agent, and update
      // this literal if the enum differs.
      llm: 'claude-sonnet-5',
      backup_llm_config: { enabled: false },
      max_duration_seconds: 900,
      client_events: clientEventsWithInterruption(),
      turn_eagerness: 'normal',
      privacy: { audio_retention: false },
      prompt: VOICE_PERSONA,
      first_message: VOICE_FIRST_MESSAGE,
      dynamic_variables: { dynamic_variable_placeholders: DYNAMIC_VARIABLE_DEFAULTS },
    },
    tools: registry.tools.map(toClientTool),
    controlTools: registry.controlTools.map(toClientTool),
  };
}

/**
 * The real PATCH body, built from the ElevenLabs Agents Platform API reference
 * (docs fetched 2026-09-22, `PATCH https://api.elevenlabs.io/v1/convai/agents/{agent_id}`):
 *
 *   conversation_config.agent.prompt.llm                    model id
 *   conversation_config.agent.prompt.backup_llm_config       {preference: "disabled"|"default"|"override", order?}
 *   conversation_config.agent.prompt.prompt                  persona / system prompt text
 *   conversation_config.agent.prompt.tools[]                 client tool defs, type: "client"
 *   conversation_config.agent.first_message                  greeting text, {{var}} substitution applies
 *   conversation_config.agent.dynamic_variables.dynamic_variable_placeholders
 *                                                             map of variable name -> fallback text used
 *                                                             when a session omits that dynamic variable
 *   conversation_config.conversation.max_duration_seconds
 *   conversation_config.conversation.client_events
 *   conversation_config.turn.turn_eagerness
 *   platform_settings.privacy.record_voice                  boolean, false = do not keep audio
 *
 * Both `tools` and `controlTools` are sent in the one `prompt.tools` array: the agent has to be
 * able to call every one of them, and the vendor's schema has a single tools list, not two.
 * The tools/controlTools split only exists in this repo's registry and in the dry-run file above.
 *
 * NOT independently re-verified against the live API in this run (that only happens once gate
 * 0.1 clears and this path is exercised for real): the shape above follows the documented
 * reference, but a field name or default could still be off. Read the response body on the
 * first real --push and fix here if it disagrees.
 */
/**
 * The model id the agent runs on. Defaults to Claude Sonnet 5 per the plan; ELEVENLABS_LLM lets
 * the operator fall back to claude-sonnet-4-5 (the vendor's own recommendation for tools) without
 * a code change if the first probe scores under 9 of 10.
 */
const AGENT_LLM = process.env.ELEVENLABS_LLM || 'claude-sonnet-5';

/**
 * Variables every token route version deployed so far sends. The first message may only use
 * these: ElevenLabs aborts the call (error 1008, agent_configuration_error) when a first-message
 * variable is missing, and the agent config is shared by every revision that is live. Measured
 * 2026-09-23 on two failed calls after `today` slipped into the greeting.
 */
const FIRST_MESSAGE_SAFE_VARIABLES = new Set(['name', 'role', 'assignedToMe', 'myOpenTickets']);

function assertFirstMessageIsSafe(): void {
  const used = [...VOICE_FIRST_MESSAGE.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)].map((m) => m[1]);
  const unsafe = used.filter((v) => !FIRST_MESSAGE_SAFE_VARIABLES.has(v));
  if (unsafe.length > 0) {
    throw new Error(
      `first message uses variables not every deployed token route sends: ${unsafe.join(', ')}. ` +
        'Deploy the route first, then add the variable to FIRST_MESSAGE_SAFE_VARIABLES.',
    );
  }
}

function buildPushBody(registry: RegistryExport) {
  assertFirstMessageIsSafe();
  const allTools = [...registry.tools, ...registry.controlTools].map(toClientTool);
  return {
    conversation_config: {
      agent: {
        // Sibling of `prompt`, not nested inside it: the ElevenLabs Agents Platform update API
        // reference (fetched 2026-09-22) puts both first_message and dynamic_variables directly
        // under conversation_config.agent, while prompt/tools/llm live one level deeper under
        // conversation_config.agent.prompt.
        first_message: VOICE_FIRST_MESSAGE,
        dynamic_variables: { dynamic_variable_placeholders: DYNAMIC_VARIABLE_DEFAULTS },
        prompt: {
          llm: AGENT_LLM,
          backup_llm_config: { preference: 'disabled' },
          prompt: VOICE_PERSONA,
          tools: allTools,
        },
      },
      conversation: {
        max_duration_seconds: 900,
        client_events: clientEventsWithInterruption(),
      },
      turn: {
        turn_eagerness: 'normal',
      },
    },
    platform_settings: {
      privacy: {
        record_voice: false,
      },
      // Private agent: sessions need a server-minted token or signed URL. No allowlist, on
      // purpose: the vendor says signed URLs or tokens and allowlists must not be configured
      // together on the same agent.
      auth: {
        enable_auth: true,
      },
    },
  };
}

function parseArgs(argv: string[]) {
  const flags = new Set(argv);
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex !== -1 ? argv[outIndex + 1] : undefined;
  return {
    dryRun: flags.has('--dry-run'),
    push: flags.has('--push'),
    probe: flags.has('--probe'),
    create: flags.has('--create'),
    outPath,
  };
}

/**
 * --create: POST the same body to /v1/convai/agents/create with the agent name, and print the
 * new agent id (and nothing else) so the caller can store it in Secret Manager. Needs only
 * ELEVENLABS_API_KEY. Refuses to run when ELEVENLABS_AGENT_ID is already set, so a second
 * invocation cannot silently create a duplicate agent.
 */
async function runCreate(): Promise<number> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('not configured: ELEVENLABS_API_KEY must be set');
    return 3;
  }
  if (process.env.ELEVENLABS_AGENT_ID) {
    console.error('ELEVENLABS_AGENT_ID is already set; use --push to update that agent instead of creating another');
    return 1;
  }

  const registry = exportRegistry();
  const body = { name: 'Assistant', ...buildPushBody(registry) };

  const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`ElevenLabs create-agent answered ${res.status}: ${text}`);
    return 2;
  }

  const data = (await res.json()) as { agent_id?: string };
  if (!data.agent_id) {
    console.error('create-agent answered without an agent_id');
    return 2;
  }
  console.log(data.agent_id);
  return 0;
}

async function runDryRun(outPath: string | undefined): Promise<number> {
  if (!outPath) {
    console.error('--dry-run requires --out <file>');
    return 1;
  }
  const registry = exportRegistry();
  const config = buildDryRunConfig(registry);
  writeFileSync(outPath, JSON.stringify(config, null, 2));
  console.log(`wrote ${outPath}: ${config.tools.length} tools, ${config.controlTools.length} control tools`);
  return 0;
}

async function runPush(): Promise<number> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    console.error('not configured: ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must both be set');
    return 3;
  }

  const registry = exportRegistry();
  const body = buildPushBody(registry);

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // The response body may echo request details but never the key: it was sent in a header,
    // not the body, so nothing here can leak it.
    const text = await res.text();
    console.error(`ElevenLabs update-agent answered ${res.status}: ${text}`);
    return 2;
  }

  console.log(`pushed agent config: ${body.conversation_config.agent.prompt.tools.length} tools`);
  return 0;
}

async function runProbe(): Promise<number> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    console.error('not configured: ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must both be set');
    return 3;
  }

  // The Phase 0.1 probe needs to drive the agent's TEXT mode through ten scripted turns and
  // read back which client tool it called with which parameters. The ElevenLabs Agents
  // Platform docs available to this script describe the WebSocket conversation protocol
  // (wss://api.elevenlabs.io/v1/convai/conversation, the same channel real calls use) but not
  // a documented text-only request/response pair that could be driven from a short-lived
  // Node script without a full WebRTC/WebSocket client session. Implementing the probe over
  // that channel is real work (a WebSocket client, session lifecycle, tool-call parsing) that
  // this run did not build rather than guess at.
  console.error('probe requires the WebSocket text channel; not implemented in this run');
  return 3;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    process.exitCode = await runDryRun(args.outPath);
    return;
  }
  if (args.push) {
    process.exitCode = await runPush();
    return;
  }
  if (args.probe) {
    process.exitCode = await runProbe();
    return;
  }
  if (args.create) {
    process.exitCode = await runCreate();
    return;
  }

  console.error('usage: sync-voice-agent.ts --dry-run --out <file> | --create | --push | --probe');
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('sync-voice-agent failed:', err);
  process.exitCode = 1;
});
