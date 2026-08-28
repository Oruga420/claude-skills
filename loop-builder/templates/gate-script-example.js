// Combo-trigger gate script (trigger type #4).
// A cron ticker runs THIS script instead of waking the agent directly.
// It checks the data source programmatically; the agent only wakes when
// there is real work — batched and preloaded. Skips cost ~0 tokens.
//
// Pattern from the video's support-inbox triage loop (Intercom example).
// Adapt fetchNewWork() to your source: git log, IMAP, error tracker, DB, etc.
// Exit contract: print JSON {run: boolean, batch: [...]} — the ticker wakes
// the agent (e.g. `claude -p`) only when run === true, passing the batch in.

const WINDOW_MINUTES = 30;

async function fetchNewWork() {
  // Example: recent Intercom conversations in the last WINDOW_MINUTES.
  const since = Math.floor(Date.now() / 1000) - WINDOW_MINUTES * 60;
  const res = await fetch(
    `https://api.intercom.io/conversations/search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: {field: 'updated_at', operator: '>', value: since},
      }),
    },
  );
  const data = await res.json();
  // Filter to REAL updates (new user messages, not bot echoes/tag changes).
  return (data.conversations ?? []).filter(
    (c) => c.waiting_since && c.state === 'open',
  );
}

const work = await fetchNewWork();
if (work.length === 0) {
  console.log(JSON.stringify({run: false, batch: []}));
} else {
  console.log(
    JSON.stringify({
      run: true,
      batch: work.map((c) => ({id: c.id, title: c.title, waiting: c.waiting_since})),
    }),
  );
}
