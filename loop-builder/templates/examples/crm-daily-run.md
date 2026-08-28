# crm-daily-run — contract

<!-- The video's non-engineering loop: every morning the agent segments the
     user base, drafts/sends outreach per approval tiers, and updates a local
     dashboard. Shows that loop contracts work far beyond code. -->

## Goal

Run the CRM daily pipeline every morning so the owner wakes to a fresh action
dashboard and high-touch drafts. This README is the SOP contract; the local
`crm.db` is the only store. Monitor — no finish line.

## Boundaries

**Can send alone** (auto-send, explicitly authorized on {date}):
- Daily campaign outreach + replies for approved segments, top priority first,
  hard cap {60} emails/day.

**Must draft + wait for approval:**
- Any new segment or message pattern not yet authorized; anything with
  pricing/refund implications.

**Never (anti-double-send rules, in force):**
- **7-day suppression** — anyone emailed in the last 7 days is excluded from
  ALL campaign membership.
- **Replied = live conversation** — status `replied` excludes them from
  campaigns entirely: personal handling, never batch.
- **One primary email per user per day** (priority ladder decides which
  segment claims them first).
- **Follow-up cap: max 1 without a reply.**
- **Never draft blind** — always include the user's past correspondence
  (what we sent, whether they replied) in the drafting context.
- **Run ends when the turn ends** — never arm a background watcher and end the
  turn to "wait"; finish the work in-turn or log what's pending.

## SOP

1. **Gap check first** — hours since the last dated run entry in Timeline. If
   the gap > 24h the loop skipped days: widen the fetch windows so missed-day
   data is still exported.
2. **Live fetch** — pull the last 24h of active users + their activity and
   replies from the product DB.
3. **Enrichment** — join account features + behavioral signals (persona,
   use-case, key blockers, unmet needs) keyed by email.
4. **Segment** — e.g.: small influencers → affiliate/distribution outreach
   (helper-first, never a pitch) · users clearly frustrated per the LLM session
   logs → rescues (send the specific fix we diagnosed) · engaged-but-free →
   upgrade nurture · fresh free→paid converts (≤2 days) → new-upgrade check-in
   (thank them, help them succeed, ask what they're building — converts are
   high-value distribution intel).
5. **Research + draft per member** — dedupe identical texts, flag silent
   generation failures, use only the user's own words as quotes.
6. **Send / queue per Boundaries tier**, respecting every anti-double-send rule.
7. **Refresh the dashboard** (action queue per segment with approve/queue).
8. Append ONE dated Timeline entry: replies received · drafts ready · sent per
   segment · new proposals · notable finds.

## State

- Current understanding / hypothesis: {what segments are working, reply rates}
- Priority ladder: {segment order}
- Needs follow-up: {contacted ≥7d ago, no reply, ≤1 send}

## Logs (Timeline)

<!-- append-only: ONE dated entry per run -->

- {YYYY-MM-DD} · run #0 · loop created; auto-send OFF until explicitly authorized
