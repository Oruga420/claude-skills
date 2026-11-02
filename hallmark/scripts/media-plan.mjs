#!/usr/bin/env node
// Offline handoff only. No network, credential access, subprocesses or generation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const KEYS = new Set(['kind', 'prompt', 'provider', 'constraints', 'references', 'aspect_ratio', 'count', 'budget_usd', 'generation_authorized']);
export function planMedia(brief) {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) throw new Error('Expected a JSON brief object');
  for (const key of Object.keys(brief)) if (!KEYS.has(key)) throw new Error(`Unknown field: ${key}; never put credentials in a brief`);
  if (!['prompt', 'image', 'video'].includes(brief.kind)) throw new Error('kind must be prompt, image or video');
  if (typeof brief.prompt !== 'string' || !brief.prompt.trim()) throw new Error('prompt must be nonempty text');
  const provider = brief.provider ?? 'auto';
  if (!['auto', 'higgsfield', 'replicate'].includes(provider)) throw new Error('Unsupported provider; resolve a new provider with the user');
  for (const key of ['constraints', 'references']) {
    if (brief[key] !== undefined && (!Array.isArray(brief[key]) || brief[key].some(s => typeof s !== 'string' || !s.trim()))) throw new Error(`${key} must be an array of nonempty strings`);
  }
  if (brief.generation_authorized !== undefined && typeof brief.generation_authorized !== 'boolean') throw new Error('generation_authorized must be boolean');
  if (brief.budget_usd !== undefined && (typeof brief.budget_usd !== 'number' || !Number.isFinite(brief.budget_usd) || brief.budget_usd < 0)) throw new Error('budget_usd must be a finite nonnegative number');
  if (brief.aspect_ratio !== undefined && (typeof brief.aspect_ratio !== 'string' || !/^\d+[.:]\d+$/.test(brief.aspect_ratio) || brief.aspect_ratio.split(/[.:]/).some(n => Number(n) <= 0))) throw new Error('aspect_ratio must be positive W:H');
  const count = brief.count ?? 1;
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('count must be a positive integer; provider limits are discovered at runtime');
  const constraints = brief.constraints ?? [];
  const finalPrompt = brief.prompt + (constraints.length ? '\n\nConstraints (preserve all):\n' + constraints.map(c => `- ${c}`).join('\n') : '');
  const common = { schema_version: 1, execution: 'none', status: brief.kind === 'prompt' ? 'prompt_only' : 'handoff_only',
    kind: brief.kind, final_prompt: finalPrompt, requested_provider: provider,
    references: brief.references ?? [], constraints, count,
    ...(brief.aspect_ratio ? { aspect_ratio: brief.aspect_ratio } : {}),
    generation_requested: brief.kind !== 'prompt', submitted_jobs: [] };
  if (brief.kind === 'prompt') return { ...common, next_action: 'Return the complete final prompt. Do not discover a model, upload, estimate or generate.' };
  return { ...common,
    budget_usd: brief.budget_usd ?? (brief.kind === 'video' ? 5 : null),
    budget_scope: brief.kind === 'video' ? 'total including generation, voice, music and render' : 'explicit request only; no inferred image budget',
    authorization_note: brief.generation_authorized === true ? 'Brief records authorization; executing agent must verify current scope and spending evidence.' : 'Production authorization is not recorded; resolve before submitting.',
    requires_runtime_estimate: true, model: null,
    handoff: [
      'Use the named provider, or discover an available authorized connection. MCP first; no invented endpoints or model IDs.',
      'Read current model schema, input roles, limits and prices. An estimate with references may upload them; verify upload authorization first.',
      'Confirm actual request, scope, count and total budget. New providers/subscriptions require approval.',
      'Submit once through the agent tool or an authorized existing API credential; record the returned job ID.',
      'Poll the existing job after an uncertain response. Never blindly resubmit a possibly accepted paid job.',
      'Inspect actual output and save provenance without secrets; a successful job is not proof of visual quality.'
    ],
    ...(brief.kind === 'video' ? { video: { composition: 'code-first', rendering: 'cloud by default', runpod: 'requires current-task authorization', approval: 'immediately before production unless the current explicit request already authorizes that concrete scope and spend' } } : {})
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: media-plan.mjs <brief.json>');
    console.log(JSON.stringify(planMedia(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
