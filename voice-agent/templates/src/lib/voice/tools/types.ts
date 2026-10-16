/**
 * The shape every voice tool has, and the contract the rest of the voice work builds on.
 *
 * Two rules live here rather than in a prompt, because a prompt is a suggestion:
 *  - `allowedRoles` mirrors the gate the API route actually enforces, so the agent never
 *    offers an action the server will answer 403 to.
 *  - `annotations.consequentialHint` marks the tools that may not execute themselves. They
 *    raise the overlay through the confirm store and return at once.
 */

import type { ConfirmStore } from '../confirm';

/** The three roles in the users table. Named here so the registry never imports the db layer. */
export type VoiceRole = 'member' | 'agent' | 'admin';

/**
 * view  drives the page (navigate, filters, open a modal); touches no data
 * read  calls a GET route and speaks the answer
 * consequential  raises the overlay; the write happens after the person says yes
 * control  arms or stops a pending proposal; never offered as one of the 14
 */
export type ToolKind = 'view' | 'read' | 'consequential' | 'control';

/** The subset of JSON Schema the ElevenLabs agent config and the local validator both accept. */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Every tool answers in this shape, and `speak` is always a finished English sentence the
 * agent can read aloud without rewriting it. A failure is not an exception: the agent has to
 * say something either way, and a thrown error would leave it silent.
 *
 * question  the input was ambiguous; `speak` is the question to ask back
 * forbidden the caller may not do this; `speak` names who can
 * not_found the code or the person does not exist
 * error     the route failed
 */
export type ToolResult<O = unknown> =
  | { ok: true; data: O; speak: string }
  | { ok: false; kind: 'question' | 'forbidden' | 'not_found' | 'error'; speak: string };

/** Thrown by ToolContext.fetchJson so tools can map a status onto a spoken sentence. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Sent by the overlay's executor on every voice write. The routes read it in phase 1.5 so a
 * ticket created by voice is distinguishable from one typed into the form.
 */
export const VOICE_SOURCE_HEADER = 'X-App-Source';
export const VOICE_SOURCE_VALUE = 'voice';

/** What the person said to confirm, trimmed to this many characters before it is sent. */
export const VOICE_CONFIRMATION_HEADER = 'X-App-Confirmation';
export const VOICE_CONFIRMATION_MAX_CHARS = 200;

export interface VoiceUser {
  id: number;
  name: string;
  email: string;
  role: VoiceRole;
}

export interface ToolContext {
  user: VoiceUser;
  /** Same origin. Unwraps the { success, data, error } envelope; throws ApiError with status. */
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
  dispatchViewCommand(cmd: { navigate?: string; filters?: Record<string, unknown> }): void;
  notifyDataChanged(): void;
  confirm: ConfirmStore;
  now(): number;
}

export interface VoiceTool<I = unknown, O = unknown> {
  name: string;
  /** Short human label for the overlay and the sync script. */
  title: string;
  /** Says WHEN to call the tool, not only what it does. This text is what the agent sees. */
  description: string;
  kind: ToolKind;
  inputSchema: JsonSchema;
  /** Every tool answers something the agent must speak, so this is true throughout. */
  expectsResponse: boolean;
  responseTimeoutSecs: number;
  allowedRoles: VoiceRole[] | 'everyone';
  annotations: { readOnlyHint: boolean; consequentialHint: boolean };
  execute(input: I, ctx: ToolContext): Promise<ToolResult<O>>;
}

/** What the sync script pushes to ElevenLabs. Pure data, no functions. */
export interface ExportedTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  expectsResponse: boolean;
  responseTimeoutSecs: number;
  kind: ToolKind;
}

export interface ExportedRegistry {
  tools: ExportedTool[];
  controlTools: ExportedTool[];
}

/** The timeout the vendor caps at 120 s. Reads are quick; a proposal returns immediately. */
export const DEFAULT_RESPONSE_TIMEOUT_SECS = 20;

export type { ConfirmStore, PendingAction, ProposalSnapshot, ProposalState } from '../confirm';
