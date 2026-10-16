/**
 * The ElevenLabs conversation-token fetch, pulled out of the route handler.
 *
 * Next.js route files (src/app/api/**\/route.ts) may only export the HTTP method handlers
 * (GET, POST, ...); any other export fails the generated .next/types check under
 * `npx tsc --noEmit` and would fail `npm run build` the same way. The test seam
 * (setTokenFetcher / resetTokenFetcher) has to live somewhere else, so it lives here.
 */

export interface ConversationTokenResult {
  conversation_token: string;
  conversation_id: string;
}

export type TokenFetcher = (agentId: string, apiKey: string) => Promise<ConversationTokenResult>;

async function defaultTokenFetcher(agentId: string, apiKey: string): Promise<ConversationTokenResult> {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs token endpoint answered ${res.status}`);
  }

  const body = (await res.json()) as {
    token?: string;
    conversation_token?: string;
    conversation_id?: string;
  };
  const token = body.conversation_token ?? body.token;
  if (!token) {
    throw new Error('ElevenLabs token endpoint returned no token');
  }

  return { conversation_token: token, conversation_id: body.conversation_id ?? '' };
}

let tokenFetcher: TokenFetcher = defaultTokenFetcher;

export function getTokenFetcher(): TokenFetcher {
  return tokenFetcher;
}

/** Test seam: swaps out the upstream ElevenLabs call so tests never hit the network or need a real key. */
export function setTokenFetcher(fetcher: TokenFetcher): void {
  tokenFetcher = fetcher;
}

/** Restores the real upstream fetcher. Call in afterEach so a stub set by one test never leaks into the next. */
export function resetTokenFetcher(): void {
  tokenFetcher = defaultTokenFetcher;
}
