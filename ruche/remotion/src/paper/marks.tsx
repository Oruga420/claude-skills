import React from 'react';
import {P, clamp01, rnd} from './tokens';

type Pt = [number, number];

/**
 * Hand-drawn geometry. Every mark is a precise procedural path plus a seeded wobble that is
 * re-rolled on each boil tick: computational underneath, pencil on top.
 */
export const wobble = (pts: Pt[], seed: string, tick: number, amp: number): Pt[] =>
  pts.map(([x, y], i) => [
    x + rnd(`${seed}x${i}t${tick}`, -amp, amp),
    y + rnd(`${seed}y${i}t${tick}`, -amp, amp),
  ]);

/** Smooth path through points (midpoint quadratic), so wobble reads as a line, not a zigzag. */
export const pathOf = (pts: Pt[]) => {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return `${d} L${l[0].toFixed(1)},${l[1].toFixed(1)}`;
};

export const segment = (a: Pt, b: Pt, n = 10): Pt[] =>
  Array.from({length: n + 1}, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);

/** Quadratic bezier a -> b bending through control c. */
export const curve = (a: Pt, c: Pt, b: Pt, n = 16): Pt[] =>
  Array.from({length: n + 1}, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  });

export const ellipse = (cx: number, cy: number, rx: number, ry: number, overshoot = 0.12, n = 28): Pt[] =>
  Array.from({length: n + 1}, (_, i) => {
    const a = -Math.PI * 0.6 + (Math.PI * 2 * (1 + overshoot) * i) / n;
    return [cx + Math.cos(a) * rx * (1 + 0.03 * Math.sin(i)), cy + Math.sin(a) * ry];
  });

export const Stroke: React.FC<{
  pts: Pt[];
  seed: string;
  tick: number;
  progress?: number;
  color?: string;
  width?: number;
  amp?: number;
  dash?: string;
  opacity?: number;
}> = ({pts, seed, tick, progress = 1, color = P.ink, width = 4, amp = 2.2, dash, opacity = 1}) => {
  const p = clamp01(progress);
  if (p <= 0) return null;
  const d = pathOf(wobble(pts, seed, tick, amp));
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      pathLength={1}
      strokeDasharray={dash ?? '1 1'}
      strokeDashoffset={dash ? 0 : 1 - p}
    />
  );
};

export const Check: React.FC<{x: number; y: number; s: number; progress: number; tick: number; seed: string; color?: string}> = ({
  x,
  y,
  s,
  progress,
  tick,
  seed,
  color = P.signal,
}) => (
  <Stroke
    pts={[...segment([x, y + s * 0.5], [x + s * 0.35, y + s * 0.85], 4), ...segment([x + s * 0.35, y + s * 0.85], [x + s, y], 6).slice(1)]}
    seed={seed}
    tick={tick}
    progress={progress}
    color={color}
    width={s * 0.13}
    amp={s * 0.03}
  />
);

export const Cross: React.FC<{a: Pt; b: Pt; progress: number; tick: number; seed: string; color?: string; width?: number}> = ({
  a,
  b,
  progress,
  tick,
  seed,
  color = P.signal,
  width = 6,
}) => (
  <>
    <Stroke pts={segment(a, b, 8)} seed={`${seed}1`} tick={tick} progress={progress * 2} color={color} width={width} />
    <Stroke
      pts={segment([a[0], b[1]], [b[0], a[1]], 8)}
      seed={`${seed}2`}
      tick={tick}
      progress={progress * 2 - 1}
      color={color}
      width={width}
    />
  </>
);

/**
 * The dot motif. `count` dots drawn from a fixed seeded population, so a dot that exists
 * keeps existing as the count grows (accumulation). `order` moves every dot from its loose
 * position to a strict grid slot (synchronization); `collapse` pulls all of them into one
 * point (compression).
 */
export const DotField: React.FC<{
  count: number;
  seed: string;
  tick: number;
  order?: number;
  collapse?: number;
  box: [number, number, number, number];
  target?: Pt;
  color?: string;
  every?: number;
  r?: number;
  still?: boolean;
}> = ({count, seed, tick, order = 0, collapse = 0, box, target, color = P.ink, every = 11, r = 7, still = false}) => {
  const [bx, by, bw, bh] = box;
  const n = Math.max(0, Math.floor(count));
  const cols = Math.max(1, Math.round(Math.sqrt((n * bw) / Math.max(1, bh))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const tgt = target ?? [bx + bw / 2, by + bh / 2];
  const dots = [];
  for (let i = 0; i < n; i++) {
    const lx = bx + rnd(`${seed}dx${i}`) * bw;
    const ly = by + rnd(`${seed}dy${i}`) * bh;
    const gx = bx + ((i % cols) + 0.5) * (bw / cols);
    const gy = by + (Math.floor(i / cols) + 0.5) * (bh / rows);
    const jig = still || order > 0.95 ? 0 : 1.6;
    let x = lx + (gx - lx) * order + rnd(`${seed}j${i}t${tick}`, -jig, jig);
    let y = ly + (gy - ly) * order + rnd(`${seed}k${i}t${tick}`, -jig, jig);
    x += (tgt[0] - x) * collapse;
    y += (tgt[1] - y) * collapse;
    const hot = i % every === every - 1;
    const rr = r * (0.55 + rnd(`${seed}r${i}`) * 0.9) * (hot ? 1.35 : 1);
    dots.push(<circle key={i} cx={x} cy={y} r={rr} fill={hot ? P.signal : color} />);
  }
  return <>{dots}</>;
};
