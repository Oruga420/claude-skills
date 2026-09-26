import {AudioMap, Scene, Word} from '../types';
import {BOIL, norm} from './tokens';

/**
 * The score: everything a scene may ask about its audio. Visuals read structure from here
 * (who is speaking, where the pauses are, how much sound has accumulated, where the cuts
 * fall) instead of reading raw amplitude.
 */
export type Score = {
  scene: Scene;
  map: AudioMap | null;
  /** prefix sums of voice+music loudness, for O(1) accumulation queries */
  acc: Float64Array | null;
};

export const buildAcc = (map: AudioMap | null | undefined): Float64Array | null => {
  if (!map || !map.voice?.length) return null;
  const n = Math.max(map.voice.length, map.music?.length ?? 0);
  const acc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) acc[i + 1] = acc[i] + (map.voice[i] ?? 0) + 0.6 * (map.music?.[i] ?? 0);
  return acc;
};

const g = (sc: Score, f: number) => (sc.scene.start ?? 0) + f;

/** Sound energy accumulated since the scene started, in "loud seconds". Grows, never bounces. */
export const accumulated = (sc: Score, f: number, fps = 30) => {
  if (!sc.acc) {
    const spoken = (sc.scene.words ?? []).filter((w) => w.s <= f).length;
    return spoken * 0.35;
  }
  const a = Math.min(sc.acc.length - 1, g(sc, 0));
  const b = Math.min(sc.acc.length - 1, Math.max(a, g(sc, f)));
  return (sc.acc[b] - sc.acc[a]) / fps;
};

export const inPause = (sc: Score, f: number) =>
  (sc.scene.pauses ?? []).find(([a, b]) => f >= a && f < b) ?? null;

/**
 * The boil tick for hand-drawn marks. During a pause it freezes on the frame the silence
 * began: when the voice stops, the drawing holds its breath.
 */
export const boilTick = (sc: Score, f: number) => {
  const p = inPause(sc, f);
  return Math.floor((p ? p[0] : f) / BOIL);
};

export const currentWord = (sc: Score, f: number): number => {
  const ws = sc.scene.words ?? [];
  let k = -1;
  for (let i = 0; i < ws.length; i++) if (ws[i].s <= f) k = i;
  return k;
};

/**
 * Frame at which `token` is first spoken (prefix match, accents ignored), or `fallback`.
 * Content words only: anything under 3 letters is too common to anchor to.
 */
export const spokenAt = (words: Word[] | undefined, token: string, fallback: number, after = 0) => {
  const t = norm(token);
  if (t.length < 3 || !words) return fallback;
  const stem = t.slice(0, Math.max(4, Math.ceil(t.length * 0.7)));
  const hit = words.find((w) => w.s >= after && norm(w.w).startsWith(stem));
  return hit ? hit.s : fallback;
};

/** Longest word of a line: the one most likely to be said aloud and to carry the meaning. */
export const keyword = (line: string) =>
  line.split(/\s+/).reduce((best, w) => (norm(w).length > norm(best).length ? w : best), '');

/**
 * When each of `lines` should land: at the moment its keyword is spoken, else spread over
 * the speech. Always non-decreasing, so accumulation reads left to right in time.
 */
export const cueLines = (sc: Score, lines: string[], from = 10) => {
  const ws = sc.scene.words ?? [];
  const lastSpoken = ws.length ? ws[ws.length - 1].s : sc.scene.frames * 0.6;
  const span = Math.max(20, lastSpoken - from);
  let prev = from;
  return lines.map((line, i) => {
    const even = from + (span * (i + 0.5)) / Math.max(1, lines.length);
    const at = Math.max(prev + 4, spokenAt(ws, keyword(line), even, prev));
    prev = at;
    return Math.min(at, sc.scene.frames - 20);
  });
};

/**
 * Cuts: the frame of the most recent strong onset at least `gap` frames after the previous
 * accepted one. Returns the cut count so far, which a scene maps to a framing.
 */
export const cutIndex = (sc: Score, f: number, gap = 24) => {
  const on = sc.map?.onsets ?? [];
  const a = sc.scene.start ?? 0;
  let n = 0;
  let last = -1e9;
  for (const o of on) {
    const local = o - a;
    if (local < 8 || local > f) continue;
    if (local - last < gap) continue;
    last = local;
    n++;
  }
  return n;
};
