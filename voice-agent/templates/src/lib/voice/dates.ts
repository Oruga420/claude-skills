/**
 * Turns what a person says about time into the YYYY-MM-DD strings History's filters take.
 *
 * The bug this closes: asked for "last month" on History, the agent had no notion of today
 * and asked the person for today's date, then still got the year wrong. `resolveDateRange` is
 * a pure function of an injected `today`, so the caller (set_history_filters) always has the
 * real date and never has to ask for it. Every named range and the free text patterns below
 * resolve to concrete ISO dates plus a spoken description; anything unrecognised comes back
 * with an empty `spoken`, which the caller reads as "ask a clarifying question" rather than
 * guessing.
 */

export interface DateRangeInput {
  /** Already an ISO date (YYYY-MM-DD) it passes through untouched. Anything else is ignored. */
  from?: string;
  to?: string;
  /** A named range (today, last_month, this_week, ...) or free text (last month, since September 1). */
  range?: string;
}

export interface DateRangeResult {
  from?: string;
  to?: string;
  /** Empty when nothing could be resolved: the signal to the caller to ask a question. */
  spoken: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

/** Calendar parts of a Date, read in the caller's local time so "today" means their today. */
function parts(date: Date): { y: number; m: number; d: number } {
  return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
}

/** Date.UTC arithmetic sidesteps DST shifts that plain local-time day math is exposed to. */
function addDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Monday-start weekday index: 0 = Monday, ..., 6 = Sunday. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function humanDate(iso: string, todayYear: number): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  const label = `${MONTH_NAMES[m][0].toUpperCase()}${MONTH_NAMES[m].slice(1)} ${d}`;
  return y === todayYear ? label : `${label}, ${y}`;
}

function speakRange(from: string | undefined, to: string | undefined, todayIso: string, todayYear: number): string {
  if (from && to) {
    if (from === to) return `on ${humanDate(from, todayYear)}`;
    if (to === todayIso) return `from ${humanDate(from, todayYear)} to today`;
    return `from ${humanDate(from, todayYear)} to ${humanDate(to, todayYear)}`;
  }
  if (from) return `since ${humanDate(from, todayYear)}`;
  if (to) return `up to ${humanDate(to, todayYear)}`;
  return '';
}

/** Resolves a named or free-text range against `today`. Returns undefined when unrecognised. */
function resolveNamed(key: string, today: Date): { from: string; to: string } | undefined {
  const { y, m, d } = parts(today);
  const todayIso = ymd(y, m, d);

  switch (key) {
    case 'today':
      return { from: todayIso, to: todayIso };
    case 'yesterday': {
      const p = addDays(y, m, d, -1);
      const iso = ymd(p.y, p.m, p.d);
      return { from: iso, to: iso };
    }
    case 'this_week': {
      const monday = addDays(y, m, d, -mondayIndex(today));
      return { from: ymd(monday.y, monday.m, monday.d), to: todayIso };
    }
    case 'last_week': {
      const mondayThisWeek = addDays(y, m, d, -mondayIndex(today));
      const mondayLastWeek = addDays(mondayThisWeek.y, mondayThisWeek.m, mondayThisWeek.d, -7);
      const sundayLastWeek = addDays(mondayLastWeek.y, mondayLastWeek.m, mondayLastWeek.d, 6);
      return {
        from: ymd(mondayLastWeek.y, mondayLastWeek.m, mondayLastWeek.d),
        to: ymd(sundayLastWeek.y, sundayLastWeek.m, sundayLastWeek.d),
      };
    }
    case 'this_month':
      return { from: ymd(y, m, 1), to: todayIso };
    case 'last_month': {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return { from: ymd(py, pm, 1), to: ymd(py, pm, daysInMonth(py, pm)) };
    }
    case 'last_7_days': {
      const p = addDays(y, m, d, -6);
      return { from: ymd(p.y, p.m, p.d), to: todayIso };
    }
    case 'last_30_days': {
      const p = addDays(y, m, d, -29);
      return { from: ymd(p.y, p.m, p.d), to: todayIso };
    }
    case 'this_year':
      return { from: ymd(y, 0, 1), to: todayIso };
    default:
      return undefined;
  }
}

/** "past N days/weeks" style free text, both digit and word forms. */
function resolvePastSpan(text: string, today: Date): { from: string; to: string } | undefined {
  const { y, m, d } = parts(today);
  const todayIso = ymd(y, m, d);

  const daysMatch = text.match(/^past\s+(\d+|one|two|three|four|five|six)\s+days?$/);
  if (daysMatch) {
    const n = Number.isNaN(Number(daysMatch[1])) ? WORD_NUMBERS[daysMatch[1]] : Number(daysMatch[1]);
    const p = addDays(y, m, d, -(n - 1));
    return { from: ymd(p.y, p.m, p.d), to: todayIso };
  }

  const weeksMatch = text.match(/^(?:past|last)\s+(\d+|one|two|three|four|five|six)\s+weeks?$/);
  if (weeksMatch) {
    const n = Number.isNaN(Number(weeksMatch[1])) ? WORD_NUMBERS[weeksMatch[1]] : Number(weeksMatch[1]);
    const p = addDays(y, m, d, -(n * 7 - 1));
    return { from: ymd(p.y, p.m, p.d), to: todayIso };
  }

  return undefined;
}

/**
 * "since <month> [day][, year]" and a bare month name. A year-less month/day resolves to the
 * most recent occurrence not after today: naming a month that has not happened yet this year
 * rolls back to last year, exactly like a person means when they say "since December 1" in
 * March.
 */
function resolveMonthPhrase(text: string, today: Date): { from: string; to: string } | undefined {
  const { y, m, d } = parts(today);
  const todayIso = ymd(y, m, d);

  const since = text.match(/^since\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/);
  if (since) {
    const monthIdx = MONTH_NAMES.indexOf(since[1]);
    if (monthIdx === -1) return undefined;
    const day = Number(since[2]);
    let year = since[3] ? Number(since[3]) : y;
    if (!since[3]) {
      const candidate = new Date(Date.UTC(year, monthIdx, day));
      const todayUtc = new Date(Date.UTC(y, m, d));
      if (candidate.getTime() > todayUtc.getTime()) year -= 1;
    }
    return { from: ymd(year, monthIdx, day), to: todayIso };
  }

  const bareMonth = text.match(/^(?:in\s+)?([a-z]+)$/);
  if (bareMonth) {
    const monthIdx = MONTH_NAMES.indexOf(bareMonth[1]);
    if (monthIdx === -1) return undefined;
    const year = monthIdx <= m ? y : y - 1;
    return { from: ymd(year, monthIdx, 1), to: ymd(year, monthIdx, daysInMonth(year, monthIdx)) };
  }

  return undefined;
}

/**
 * Resolves `input` against `today`. ISO `from`/`to` pass straight through and win over
 * anything `range` would have computed for that same end. A `range` that cannot be understood,
 * with nothing else to fall back on, comes back as `{ spoken: '' }`.
 */
export function resolveDateRange(input: DateRangeInput, today: Date): DateRangeResult {
  const { y } = parts(today);
  const todayIso = ymd(parts(today).y, parts(today).m, parts(today).d);

  const explicitFrom = input.from && ISO_DATE.test(input.from) ? input.from : undefined;
  const explicitTo = input.to && ISO_DATE.test(input.to) ? input.to : undefined;

  let computed: { from: string; to: string } | undefined;
  if (input.range) {
    const raw = input.range.trim().toLowerCase();
    const asKeyword = raw.replace(/\s+/g, '_');
    computed = resolveNamed(asKeyword, today) ?? resolvePastSpan(raw, today) ?? resolveMonthPhrase(raw, today);
  }

  const from = explicitFrom ?? computed?.from;
  const to = explicitTo ?? computed?.to;

  if (!from && !to) {
    return { spoken: '' };
  }

  return { from, to, spoken: speakRange(from, to, todayIso, y) };
}
