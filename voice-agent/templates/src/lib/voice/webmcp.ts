/**
 * Registers the voice registry's tools on document.modelContext (native WebMCP, or the
 * @mcp-b/webmcp-polyfill fallback) so they are independently discoverable by any WebMCP-aware
 * agent probing the page, not only by the ElevenLabs clientTools map VoiceCall builds
 * separately from the same registry. WebMCP never runs the ElevenLabs conversation itself
 * (see the loop's hard rule: never call document.modelContext.executeTool from that path);
 * this is a thin, feature-detected registration layer and nothing else.
 *
 * Everything below was checked against the installed package sources, not assumed from the
 * package names, because a mismatch here fails silently at runtime (a rejected registerTool
 * promise, or a tool whose `execute` gets called with the wrong shape) rather than at compile
 * time:
 *
 * - node_modules/@mcp-b/webmcp-polyfill/dist/index.js `initializeWebMCPPolyfill()`: the first
 *   line is `if (doc.modelContext) return;` -- it already no-ops when anything (native or an
 *   earlier polyfill install) has defined document.modelContext, and it also no-ops outright
 *   in an insecure context. So it is safe to call unconditionally; this file still skips the
 *   dynamic import when `document.modelContext` already exists, to avoid pulling in the
 *   polyfill's code for a browser that will never use it.
 * - node_modules/@mcp-b/webmcp-polyfill/dist/index.js `#invokeToolByName`: every call into a
 *   registered tool's `execute` is preceded by `const args = parseChromeToolInput(inputArgsJson)`
 *   (schema.js), which JSON.parses the wire string and throws before `execute` is ever
 *   reached if it is not valid JSON. That means, for this installed polyfill version, `execute`
 *   always receives an already-parsed object or array, never a raw string. The plan's
 *   assumption ("the polyfill 5.1.0 passes a string") does not hold for what is actually
 *   vendored here; `normalizeInput` below still defensively unwraps a string anyway, in case a
 *   different polyfill build or a future native implementation ever changes that.
 * - The same file's `#invokeToolByName` also calls `serializeChromeToolResult(rawResult)` on
 *   whatever `execute` returns, AFTER `execute` returns, to produce the JSON string that goes
 *   back over the wire. So `execute` here does not need to serialize its own return value for
 *   the polyfill; it just returns the ToolResult object runTool already produces. The standard
 *   (native) `ModelContext.registerTool` signature in
 *   node_modules/@mcp-b/webmcp-types/dist/tool.d.ts is `execute: (input) => MaybePromise<TResult>`
 *   with `TResult = unknown`, so returning the same object there is consistent too.
 * - node_modules/@mcp-b/webmcp-types/dist/model-context.d.ts's `registerTool` overloads use a
 *   `WidenedSchema<TSchema>` conditional (`string extends TSchema['type'] ? unknown : never`)
 *   that is built for a schema literal written inline at the call site. A pre-typed
 *   `JsonSchema` value (our registry tools' `inputSchema`, typed with the literal
 *   `type: 'object'`) does not widen the way that trick expects, so passing it straight
 *   through the typed overloads does not resolve. This file calls `registerTool` through a
 *   small local type instead (see `AnyRegisterTool` below) rather than fight that inference
 *   in a runtime loop over an array of tools.
 */

'use client';

import type { ToolContext, VoiceTool } from './tools/types';
import { runTool } from './tools/registry';
// Type-only: pulls in @mcp-b/webmcp-types' `declare global { interface Document {
// readonly modelContext?: ModelContext } }` augmentation so `document.modelContext` below
// type-checks. Nothing in this file otherwise imports that package directly (webmcp-polyfill
// is loaded dynamically at runtime, further down), so without this line TypeScript never
// includes webmcp-types in the program and `document.modelContext` is an unknown property.
// Fully erased at compile time; no runtime import happens.
import type {} from '@mcp-b/webmcp-types';

interface RegisterToolOptions {
  signal?: AbortSignal;
}

/** The minimal registerTool shape this file actually calls, sidestepping the schema-literal
 *  inference described above. See the file docstring for why. */
type AnyRegisterTool = (
  tool: {
    name: string;
    description: string;
    inputSchema?: unknown;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
    execute: (input: unknown) => unknown;
  },
  options?: RegisterToolOptions,
) => Promise<void>;

/**
 * `execute`'s input, normalized to a plain object.
 *
 * The installed polyfill always hands `execute` an already-parsed object (see the file
 * docstring), and the standard interface's `execute` signature takes an object too. This
 * still accepts a bare JSON string defensively, so a future or different WebMCP
 * implementation that does pass a raw string does not crash the tool instead of running it.
 */
function normalizeInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // Not valid JSON: fall through to the empty-object default, same as an object-shaped
      // call with no arguments would produce.
    }
    return {};
  }
  if (input && typeof input === 'object') return input as Record<string, unknown>;
  return {};
}

/**
 * Registers every tool in `tools` on document.modelContext and returns a function that
 * unregisters all of them (aborts the shared signal, which the standard API and the polyfill
 * both honor to tear down a registration).
 *
 * Fire-and-forget by design: registration is async (`registerTool` returns a Promise), but the
 * caller (VoiceCall, mounting for the life of a call) needs a synchronous cleanup handle right
 * away, before any of the async registration has necessarily finished. A tool that fails to
 * register (a name collision, or the popover closing mid-registration) is skipped rather than
 * aborting the rest, because the ElevenLabs clientTools map built separately from the same
 * registry is the primary path to these tools; WebMCP is a secondary, best-effort surface.
 */
export function installWebMcp(tools: readonly VoiceTool[], ctx: ToolContext): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const controller = new AbortController();
  let cancelled = false;

  void (async () => {
    try {
      if (!document.modelContext) {
        const { initializeWebMCPPolyfill } = await import('@mcp-b/webmcp-polyfill');
        // No-ops if something already defined document.modelContext or the context is
        // insecure; see the file docstring.
        initializeWebMCPPolyfill();
      }

      if (cancelled) return;
      const modelContext = document.modelContext;
      if (!modelContext) {
        // No native WebMCP and the polyfill could not install (insecure context, or an
        // unexpected failure). The call still works through the ElevenLabs clientTools map.
        return;
      }

      const registerTool = modelContext.registerTool.bind(modelContext) as unknown as AnyRegisterTool;

      for (const tool of tools) {
        if (cancelled) return;
        try {
          await registerTool(
            {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: tool.annotations,
              execute: (input) => runTool(tool.name, normalizeInput(input), ctx),
            },
            { signal: controller.signal },
          );
        } catch {
          // Skip this one tool; see the docstring above for why the loop keeps going.
        }
      }
    } catch {
      // Dynamic import of the polyfill failed, or initializeWebMCPPolyfill threw. WebMCP
      // stays unavailable for this call; nothing else in the page depends on it.
    }
  })();

  return () => {
    cancelled = true;
    controller.abort();
  };
}
