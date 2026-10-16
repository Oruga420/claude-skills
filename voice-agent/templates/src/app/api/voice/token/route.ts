import { ok, bad, unauthorized, serverError } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { Db } from '@/lib/db';
import { getUserById } from '@/lib/repo/users';
import { getUserCounts } from '@/lib/repo/requirements';
import type { PersonaVariables } from '@/lib/voice/persona';
import { getTokenFetcher, type ConversationTokenResult } from '@/lib/voice/tokenFetcher';
import { toolsForRole } from '@/lib/voice/tools/registry';

/**
 * Mints a short-lived ElevenLabs conversation token for the voice agent.
 *
 * The ElevenLabs API key never reaches the client: this route holds it server-side only,
 * exchanges it for a one-time conversation token, and hands that token to the browser.
 * Rate limiting is a database table (voice_token_grants, added in migrate.ts), not an
 * in-memory Map like /api/chat's limiter, because Cloud Run can run more than one instance
 * of this app and a cold start clears process memory either way.
 *
 * The upstream fetch itself, and its test seam (setTokenFetcher/resetTokenFetcher), live in
 * src/lib/voice/tokenFetcher.ts, not here: a Next.js route file may only export HTTP method
 * handlers (GET, POST, ...); any other export fails the generated .next/types check.
 */

const RATE_LIMIT_WINDOW_MINUTES = 10;
// Raised from 5 to 20 on 2026-09-22: a dropped WebRTC connection forces a re-call, and 5 per
// 10 minutes was tripping on ordinary testing, not abuse.
const RATE_LIMIT_MAX = 20;

async function countRecentGrants(db: Db, userId: number): Promise<number> {
  const row = (await db
    .prepare(
      `SELECT COUNT(*) as n FROM voice_token_grants
       WHERE user_id = ? AND created_at > now() - interval '${RATE_LIMIT_WINDOW_MINUTES} minutes'`,
    )
    .get(userId)) as { n: number } | undefined;
  return row?.n ?? 0;
}

async function recordGrant(db: Db, userId: number): Promise<void> {
  await db.prepare('INSERT INTO voice_token_grants (user_id) VALUES (?)').run(userId);
}

/**
 * Spoken-friendly date and clock time in the server's zone, so the agent can say "it is
 * Tuesday, September 23, 2026" instead of an ISO string. Set TZ on the deployment to the
 * users' zone (for example America/New_York); a missing TZ (local dev, an unconfigured runtime) falls back to UTC
 * rather than throwing, since a persona line is worth degrading, never worth a 500.
 */
/** "Grace Hopper" becomes "Grace"; an empty or odd name falls back to itself. */
function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : fullName;
}

function computeClockStrings(now: Date): { today: string; localTime: string } {
  const zone = process.env.TZ || 'UTC';
  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
  // Intl can render the am/pm separator with a narrow no-break space (U+202F); normalized to a
  // plain space and lowercased so it reads as "2:40 pm", matching how VOICE_PERSONA speaks it.
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(now)
    .replace(/ /g, ' ')
    .toLowerCase();
  return { today, localTime };
}

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!apiKey || !agentId) {
      return bad('Voice agent is not configured', 503);
    }

    const db = await getDb();

    const recentGrants = await countRecentGrants(db, user.id);
    if (recentGrants >= RATE_LIMIT_MAX) {
      return bad(
        `You have started ${RATE_LIMIT_MAX} calls in the last ${RATE_LIMIT_WINDOW_MINUTES} minutes. Wait a few minutes before calling again.`,
        429,
      );
    }

    let upstream: ConversationTokenResult;
    try {
      upstream = await getTokenFetcher()(agentId, apiKey);
    } catch (err) {
      // Never surface the upstream error detail: it could echo the api key or the request URL.
      console.error('[voice] ElevenLabs token request failed:', err);
      return bad('Could not start the voice session right now', 502);
    }

    await recordGrant(db, user.id);

    // Read live, same as /api/auth/me: a role change or a status change takes effect on the
    // next token mint instead of waiting for the person to sign in again. Sequential, not
    // Promise.all: in tests db is a single pinned client (tests/helpers.ts), and pg queues
    // concurrent queries on one client with a deprecation warning that pg@9 will remove.
    const live = await getUserById(db, user.id);
    const counts = await getUserCounts(db, user.id);

    const role = live?.role ?? user.role;
    const { today, localTime } = computeClockStrings(new Date());
    // Built server-side from the same role gate the tool registry itself enforces, so the
    // agent is never told it can do something runTool would then refuse.
    const canDo = toolsForRole(role)
      .map((tool) => tool.title)
      .join(', ');

    // Keys match PersonaVariables (src/lib/voice/persona.ts) exactly, not a paraphrase of it:
    // ElevenLabs substitutes {{name}}, {{email}}, {{role}}, {{today}}, {{localTime}},
    // {{isAdmin}}, {{canDo}}, {{assignedToMe}}, {{myOpenTickets}} in VOICE_PERSONA from
    // whatever keys the client passes as dynamicVariables to startSession(), so a renamed key
    // here silently breaks the substitution instead of failing loudly.
    const dynamicVariables = {
      // First name only, by design: the agent greets
      // and addresses people by first name; the full name stays in the ticket data it reads.
      name: firstNameOf(live?.name ?? user.name),
      email: live?.email ?? user.email,
      role,
      today,
      localTime,
      // "yes"/"no" as strings, not booleans: ElevenLabs substitutes every dynamic variable as
      // text, so a boolean would render as the literal word "true" or "false" either way, but
      // an explicit string keeps the persona's intent obvious rather than relying on that coercion.
      isAdmin: role === 'admin' ? 'yes' : 'no',
      canDo,
      assignedToMe: counts.assignedToMe,
      myOpenTickets: counts.myOpenTickets,
    } satisfies PersonaVariables;

    return ok({
      conversation_token: upstream.conversation_token,
      conversation_id: upstream.conversation_id,
      dynamic_variables: dynamicVariables,
      expires_hint_minutes: 15,
    });
  } catch (err) {
    return serverError(err);
  }
}
