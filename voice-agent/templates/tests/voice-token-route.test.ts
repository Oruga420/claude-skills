/**
 * Tests the token route (src/app/api/voice/token/route.ts) against this app's own db test
 * helpers and repo layer (tests/helpers.ts, src/lib/repo/users.ts): those belong to the
 * host app, not to the voice module, so point these imports at your own equivalents. The
 * route itself (rate limiting via a db table, minting a conversation token, building
 * dynamic_variables from PersonaVariables) is the reusable part this test exercises.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Db } from '../src/lib/db';
import { createTempDb } from './helpers';
import { createUser } from '../src/lib/repo/users';
import type { Role } from '../src/lib/auth';

const mockGetSessionUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSessionUser: mockGetSessionUser }));

// vi.mock is hoisted above this import, so POST already sees the mocked auth module.
import { POST } from '../src/app/api/voice/token/route';
import { setTokenFetcher, resetTokenFetcher } from '../src/lib/voice/tokenFetcher';

const FAKE_KEY = 'test-key-not-real';
const FAKE_AGENT_ID = 'test-agent-not-real';

let db: Db;
let cleanup: () => Promise<void>;
let emailCounter = 0;

async function makeSessionUser(overrides: Partial<{ name: string; role: Role; email: string }> = {}) {
  emailCounter += 1;
  const user = await createUser(db, {
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `voice-user-${emailCounter}@example.com`,
    role: overrides.role ?? 'member',
  });
  mockGetSessionUser.mockResolvedValue({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_service: false,
  });
  return user;
}

async function grantCount(userId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT COUNT(*) as n FROM voice_token_grants WHERE user_id = ?')
    .get(userId)) as { n: number } | undefined;
  return row?.n ?? 0;
}

beforeEach(async () => {
  const temp = await createTempDb();
  db = temp.db;
  cleanup = temp.cleanup;
  global.__appDb = db;
  process.env.ELEVENLABS_API_KEY = FAKE_KEY;
  process.env.ELEVENLABS_AGENT_ID = FAKE_AGENT_ID;
  setTokenFetcher(async () => ({ conversation_token: 'stub-token-abc', conversation_id: 'conv-1' }));
  mockGetSessionUser.mockReset();
});

afterEach(async () => {
  global.__appDb = undefined;
  resetTokenFetcher();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_AGENT_ID;
  await cleanup();
});

describe('POST /api/voice/token', () => {
  it('returns 401 for an anonymous caller', async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('checks the session before checking configuration: an anonymous caller with no env still gets 401, not 503', async () => {
    mockGetSessionUser.mockResolvedValue(null);
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_AGENT_ID;

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 503 when ELEVENLABS_API_KEY is missing, even with a valid session', async () => {
    await makeSessionUser();
    delete process.env.ELEVENLABS_API_KEY;

    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voice agent is not configured');
  });

  it('returns 503 when ELEVENLABS_AGENT_ID is missing, even with a valid session', async () => {
    await makeSessionUser();
    delete process.env.ELEVENLABS_AGENT_ID;

    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Voice agent is not configured');
  });

  it('returns 200 with the conversation token from the stubbed fetcher and never leaks the api key', async () => {
    await makeSessionUser();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversation_token).toBe('stub-token-abc');
    expect(body.data.conversation_id).toBe('conv-1');
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it('carries the caller name and role in dynamic_variables, keyed to match VOICE_PERSONA\'s {{name}}/{{role}} placeholders', async () => {
    await makeSessionUser({ name: 'Grace Hopper', role: 'admin' });

    const res = await POST();
    const body = await res.json();
    // First name only: the agent never says surnames.
    expect(body.data.dynamic_variables.name).toBe('Grace');
    expect(body.data.dynamic_variables.role).toBe('admin');
    expect(body.data.dynamic_variables).toHaveProperty('assignedToMe');
    expect(body.data.dynamic_variables).toHaveProperty('myOpenTickets');
  });

  it('includes spoken-friendly today and localTime in dynamic_variables', async () => {
    await makeSessionUser();

    const res = await POST();
    const body = await res.json();
    expect(typeof body.data.dynamic_variables.today).toBe('string');
    expect(body.data.dynamic_variables.today.length).toBeGreaterThan(0);
    expect(typeof body.data.dynamic_variables.localTime).toBe('string');
    expect(body.data.dynamic_variables.localTime.length).toBeGreaterThan(0);
  });

  it('sets isAdmin to "yes" for an admin and "no" for a member', async () => {
    await makeSessionUser({ role: 'admin' });
    const adminRes = await POST();
    const adminBody = await adminRes.json();
    expect(adminBody.data.dynamic_variables.isAdmin).toBe('yes');

    await makeSessionUser({ role: 'member' });
    const memberRes = await POST();
    const memberBody = await memberRes.json();
    expect(memberBody.data.dynamic_variables.isAdmin).toBe('no');
  });

  it('lists admin-only tool titles in canDo only for an admin caller', async () => {
    await makeSessionUser({ role: 'admin' });
    const adminRes = await POST();
    const adminBody = await adminRes.json();
    expect(adminBody.data.dynamic_variables.canDo).toContain('Assign a ticket');

    await makeSessionUser({ role: 'member' });
    const memberRes = await POST();
    const memberBody = await memberRes.json();
    expect(memberBody.data.dynamic_variables.canDo).not.toContain('Assign a ticket');
  });

  it('returns 502 when the upstream call fails, and does not persist a grant', async () => {
    const user = await makeSessionUser();
    setTokenFetcher(async () => {
      throw new Error('boom');
    });

    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(await grantCount(user.id)).toBe(0);
  });

  it('rate limits at 20 grants per 10 minutes: the 21st call for the same user is 429 with a plain-English message, a different user still gets 200', async () => {
    const user = await makeSessionUser();

    for (let i = 0; i < 20; i += 1) {
      const res = await POST();
      expect(res.status).toBe(200);
    }

    const twentyFirst = await POST();
    expect(twentyFirst.status).toBe(429);
    const body = await twentyFirst.json();
    expect(body.error).toBe('You have started 20 calls in the last 10 minutes. Wait a few minutes before calling again.');
    expect(await grantCount(user.id)).toBe(20);

    await makeSessionUser({ email: 'other-voice-user@example.com' });
    const otherRes = await POST();
    expect(otherRes.status).toBe(200);
  });

  it('persists one grant row per successful mint', async () => {
    const user = await makeSessionUser();

    await POST();
    await POST();

    expect(await grantCount(user.id)).toBe(2);
  });

  it('runs the migration a second time without error, proving the table creation is idempotent', async () => {
    const { runMigrations } = await import('../src/lib/migrate');
    await expect(runMigrations(db)).resolves.not.toThrow();
  });
});
