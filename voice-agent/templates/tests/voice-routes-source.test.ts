/**
 * EXAMPLE: integration test for the write-source header contract, wired against this
 * app's own database test helpers, repo layer and write routes (tests/helpers.ts,
 * src/lib/repo/*, src/lib/migrate.ts, src/app/api/requirements/**). None of those exist
 * in this template: they belong to the rest of the application this voice module is
 * dropped into, not to the voice module itself. Copy the pattern (build a Request with
 * VOICE_SOURCE_HEADER / VOICE_CONFIRMATION_HEADER, call your route handler, assert the
 * stored row carries source 'voice' and the confirmation text) and point the imports at
 * your own equivalents.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type { Db } from '../src/lib/db';
import { createTempDb } from './helpers';
import { createUser, type UserRecord } from '../src/lib/repo/users';
import { createRequirement, listEvents } from '../src/lib/repo/requirements';
import { runMigrations } from '../src/lib/migrate';
import { VOICE_SOURCE_HEADER, VOICE_CONFIRMATION_HEADER } from '../src/lib/events';

const mockCookies = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ cookies: mockCookies, headers: vi.fn() }));

import { POST as postRequirement } from '../src/app/api/requirements/route';
import { POST as postStatus } from '../src/app/api/requirements/[id]/status/route';
import { POST as postCancel } from '../src/app/api/requirements/[id]/cancel/route';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth';

/**
 * Proves the voice agent's write source travels end to end: the X-App-Source and
 * X-App-Confirmation headers land on the events row the write produces, an unrecognised
 * header value never becomes 'voice', and a request with no headers or body at all keeps
 * behaving exactly as it did before this loop touched these routes (Boundary: "Keep every
 * existing behavior identical when the new headers or body fields are absent").
 */

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret-do-not-use-in-prod';
});

function asUser(user: { id: number }) {
  mockCookies.mockResolvedValue({
    get: (name: string) => (name === SESSION_COOKIE_NAME ? { value: createSessionToken(user.id) } : undefined),
  });
}

/** Builds a plain fetch Request with optional extra headers and an optional JSON body. */
function request(method: string, headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A POST with no body sent at all: no content-type, no payload. */
function requestNoBody(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { method: 'POST', headers });
}

function params(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function envelope(res: Response): Promise<{ status: number; success: boolean; data: any; error: string | null }> {
  const body = await res.json();
  return { status: res.status, ...body };
}

/** The 'created' event is always the first row listEvents returns for a fresh ticket. */
async function createdEvent(db: Db, requirementId: number) {
  const events = await listEvents(db, requirementId);
  const created = events.find((e) => e.type === 'created');
  if (!created) throw new Error('No created event found');
  return created;
}

let db: Db;
let cleanup: () => Promise<void>;
let member: UserRecord;
let admin: UserRecord;
let originalAppLocal: string | undefined;

beforeEach(async () => {
  const temp = await createTempDb();
  db = temp.db;
  cleanup = temp.cleanup;
  global.__appDb = db;
  originalAppLocal = process.env.APP_LOCAL;
  process.env.APP_LOCAL = '1';

  member = await createUser(db, { name: 'Member', email: 'member@example.com', role: 'member' });
  admin = await createUser(db, { name: 'Admin', email: 'admin@example.com', role: 'admin' });
});

afterEach(async () => {
  global.__appDb = undefined;
  await cleanup();
  if (originalAppLocal === undefined) delete process.env.APP_LOCAL;
  else process.env.APP_LOCAL = originalAppLocal;
});

const newTicketBody = {
  description: 'Need a test server for the new project',
  category: 'vms',
  priority: 'medium',
};

describe('voice write source (POST /api/requirements)', () => {
  it('tags a create made through the voice agent with source voice and stores the confirmation phrase', async () => {
    asUser(member);
    const res = await envelope(
      await postRequirement(
        request('POST', { [VOICE_SOURCE_HEADER]: 'voice', [VOICE_CONFIRMATION_HEADER]: 'yes file it' }, newTicketBody) as unknown as NextRequest,
      ),
    );
    expect(res.status).toBe(201);

    const created = await createdEvent(db, res.data.requirement.id);
    expect(created.source).toBe('voice');
    expect(created.confirmation_text).toBe('yes file it');
  });

  it('leaves an ordinary create with no voice headers as source ui and no confirmation', async () => {
    asUser(member);
    const res = await envelope(await postRequirement(request('POST', {}, newTicketBody) as unknown as NextRequest));
    expect(res.status).toBe(201);

    const created = await createdEvent(db, res.data.requirement.id);
    expect(created.source).toBe('ui');
    expect(created.confirmation_text).toBeNull();
  });

  it('treats an unrecognised source header value as ui, not voice', async () => {
    asUser(member);
    const res = await envelope(
      await postRequirement(request('POST', { [VOICE_SOURCE_HEADER]: 'evil' }, newTicketBody) as unknown as NextRequest),
    );
    expect(res.status).toBe(201);

    const created = await createdEvent(db, res.data.requirement.id);
    expect(created.source).toBe('ui');
  });

  it('trims a confirmation phrase longer than 200 characters', async () => {
    asUser(member);
    const long = 'x'.repeat(250);
    const res = await envelope(
      await postRequirement(
        request('POST', { [VOICE_SOURCE_HEADER]: 'voice', [VOICE_CONFIRMATION_HEADER]: long }, newTicketBody) as unknown as NextRequest,
      ),
    );
    expect(res.status).toBe(201);

    const created = await createdEvent(db, res.data.requirement.id);
    expect(created.confirmation_text).toHaveLength(200);
    expect(created.confirmation_text).toBe('x'.repeat(200));
  });
});

describe('voice write source (POST /api/requirements/[id]/cancel)', () => {
  it('stores a cancel note when the body carries one', async () => {
    asUser(member);
    const ticket = await createRequirement(db, {
      description: newTicketBody.description,
      category: 'vms',
      priority: 'medium',
      requesterId: member.id,
    });

    const res = await envelope(await postCancel(request('POST', {}, { note: 'No longer needed' }), params(ticket.id)));
    expect(res.status).toBe(200);
    expect(res.data.requirement.status).toBe('cancelled');

    const events = await listEvents(db, ticket.id);
    const cancelled = events.find((e) => e.type === 'cancelled');
    expect(cancelled?.note).toBe('No longer needed');
  });

  it('still cancels when no body is sent at all', async () => {
    asUser(member);
    const ticket = await createRequirement(db, {
      description: newTicketBody.description,
      category: 'vms',
      priority: 'medium',
      requesterId: member.id,
    });

    const res = await envelope(await postCancel(requestNoBody(), params(ticket.id)));
    expect(res.status).toBe(200);
    expect(res.data.requirement.status).toBe('cancelled');

    const events = await listEvents(db, ticket.id);
    const cancelled = events.find((e) => e.type === 'cancelled');
    expect(cancelled?.note).toBeNull();
    expect(cancelled?.source).toBe('ui');
  });

  it('tags a voice cancel with source voice and its confirmation phrase, alongside the note', async () => {
    asUser(member);
    const ticket = await createRequirement(db, {
      description: newTicketBody.description,
      category: 'vms',
      priority: 'medium',
      requesterId: member.id,
    });

    const res = await envelope(
      await postCancel(
        request('POST', { [VOICE_SOURCE_HEADER]: 'voice', [VOICE_CONFIRMATION_HEADER]: 'yes cancel it' }, { note: 'Duplicate request' }),
        params(ticket.id),
      ),
    );
    expect(res.status).toBe(200);

    const events = await listEvents(db, ticket.id);
    const cancelled = events.find((e) => e.type === 'cancelled');
    expect(cancelled?.source).toBe('voice');
    expect(cancelled?.confirmation_text).toBe('yes cancel it');
    expect(cancelled?.note).toBe('Duplicate request');
  });
});

describe('voice write source (POST /api/requirements/[id]/status)', () => {
  it('tags a status change made through the voice agent with source voice', async () => {
    asUser(admin);
    const ticket = await createRequirement(db, {
      description: newTicketBody.description,
      category: 'vms',
      priority: 'medium',
      requesterId: member.id,
    });

    const res = await envelope(
      await postStatus(
        request('POST', { [VOICE_SOURCE_HEADER]: 'voice', [VOICE_CONFIRMATION_HEADER]: 'yes start it' }, { status: 'in_progress' }),
        params(ticket.id),
      ),
    );
    expect(res.status).toBe(200);

    const events = await listEvents(db, ticket.id);
    const started = events.find((e) => e.type === 'started');
    expect(started?.source).toBe('voice');
    expect(started?.confirmation_text).toBe('yes start it');
  });
});

describe('the events.confirmation_text migration', () => {
  it('is idempotent: running it a second time on the same database is a no-op that leaves the column nullable', async () => {
    // createTempDb already ran the migration once. Running it again must not throw, and the
    // column must still accept a write that leaves it null, the way every event before this
    // loop shipped kept working.
    await expect(runMigrations(db)).resolves.toBeUndefined();

    const rows = (await db
      .prepare(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_name = 'events' AND column_name = 'confirmation_text' AND table_schema = current_schema()`,
      )
      .all()) as unknown as { is_nullable: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
  });
});
