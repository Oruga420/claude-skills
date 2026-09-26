import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {F, P, rnd} from './tokens';

const textures = new Map<string, string>();

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Paper tooth, fibers and mottling, painted once per render tab on a half-size canvas with a
 * fixed seed (every tab gets the same sheet) and reused as an image on every frame. A live
 * SVG turbulence filter looked the same and cost ~1 s per frame.
 */
const paperTexture = (dark: boolean, seed: number): string => {
  const key = `${dark}-${seed}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const w = 960;
  const h = 540;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return '';
  const r = mulberry(seed * 7919);
  const ink = dark ? '255,248,235' : '70,52,30';
  for (let i = 0; i < 9; i++) {
    const cx = r() * w;
    const cy = r() * h;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 120 + r() * 260);
    g.addColorStop(0, `rgba(${ink},${0.035 + r() * 0.03})`);
    g.addColorStop(1, `rgba(${ink},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  }
  x.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const sx = r() * w;
    const sy = r() * h;
    const a = r() * Math.PI * 2;
    const len = 4 + r() * 16;
    x.strokeStyle = `rgba(${ink},${0.05 + r() * 0.1})`;
    x.lineWidth = 0.4 + r() * 0.6;
    x.beginPath();
    x.moveTo(sx, sy);
    x.quadraticCurveTo(sx + Math.cos(a + 0.6) * len * 0.5, sy + Math.sin(a + 0.6) * len * 0.5, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    x.stroke();
  }
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  const [cr, cg, cb] = ink.split(',').map(Number);
  for (let i = 0; i < d.length; i += 4) {
    const v = r();
    if (v > 0.55) {
      const a = (v - 0.55) * (dark ? 0.16 : 0.28) * 255;
      const t = a / 255;
      d[i] = d[i] * (1 - t) + cr * t;
      d[i + 1] = d[i + 1] * (1 - t) + cg * t;
      d[i + 2] = d[i + 2] * (1 - t) + cb * t;
      d[i + 3] = Math.min(255, d[i + 3] + a);
    }
  }
  x.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  textures.set(key, url);
  return url;
};

/** The stock everything is printed on: flat color, the painted texture, a warm vignette. */
export const PaperGround: React.FC<{dark?: boolean; seed?: number}> = ({dark = false, seed = 3}) => (
  <AbsoluteFill style={{background: dark ? P.ink : P.paper, overflow: 'hidden'}}>
    <AbsoluteFill
      style={{
        backgroundImage: `url(${paperTexture(dark, seed)})`,
        backgroundSize: '1920px 1080px',
      }}
    />
    <AbsoluteFill
      style={{
        background: dark
          ? 'radial-gradient(90% 80% at 50% 45%, transparent 55%, rgba(0,0,0,0.45) 100%)'
          : 'radial-gradient(90% 80% at 50% 45%, transparent 60%, rgba(120,96,60,0.16) 100%)',
      }}
    />
  </AbsoluteFill>
);

/** Printer's registration marks and a slug line: the frame admits it is a printed sheet. */
export const SheetMarks: React.FC<{label: string; color: string}> = ({label, color}) => {
  const m = 46;
  const mark = (x: number, y: number) => (
    <g key={`${x}-${y}`} stroke={color} strokeWidth={1.4} fill="none">
      <circle cx={x} cy={y} r={9} />
      <line x1={x - 16} y1={y} x2={x + 16} y2={y} />
      <line x1={x} y1={y - 16} x2={x} y2={y + 16} />
    </g>
  );
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: 0.55}}>
        {[mark(m, m), mark(1920 - m, m), mark(m, 1080 - m), mark(1920 - m, 1080 - m)]}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 84,
          top: 36,
          fontFamily: F.mono,
          fontSize: 17,
          letterSpacing: 2,
          color,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

const torn = (seed: string, teeth = 22) => {
  const pts: string[] = [];
  const edge = (fx: (t: number) => [number, number]) => {
    for (let i = 0; i < teeth; i++) {
      const [x, y] = fx(i / teeth);
      pts.push(`${x}% ${y}%`);
    }
  };
  const j = (k: string | number) => rnd(`${seed}-${k}`, 0, 1.6);
  edge((t) => [t * 100, j(`t${t}`)]);
  edge((t) => [100 - j(`r${t}`), t * 100]);
  edge((t) => [100 - t * 100, 100 - j(`b${t}`)]);
  edge((t) => [j(`l${t}`), 100 - t * 100]);
  return `polygon(${pts.join(',')})`;
};

/**
 * A generated image, printed: grayscale, crushed, then halftoned. `tone="signal"` prints the
 * shadows in the signal ink (duotone); `tone="ink"` keeps it black. Torn edge, two bits of tape.
 */
export const PrintPlate: React.FC<{
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  tone?: 'signal' | 'ink';
  seed: string;
  style?: React.CSSProperties;
}> = ({src, x, y, w, h, rot = 0, tone = 'signal', seed, style}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transform: `rotate(${rot}deg)`, ...style}}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        clipPath: torn(seed),
        isolation: 'isolate',
        background: P.paperDeep,
        boxShadow: '0 1px 0 rgba(0,0,0,0.05)',
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: tone === 'signal' ? 'grayscale(1) contrast(1.6) brightness(1.08)' : 'grayscale(1) contrast(1.25) brightness(1.2)',
          mixBlendMode: 'multiply',
        }}
      />
      {tone === 'signal' ? (
        <div style={{position: 'absolute', inset: 0, background: P.signal, mixBlendMode: 'lighten'}} />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(22,19,15,0.30) 1.3px, transparent 1.9px)`,
          backgroundSize: '7px 7px',
          mixBlendMode: 'multiply',
        }}
      />
    </div>
    {[
      {l: -30, t: -14, r: -8},
      {l: w - 90, t: h - 22, r: 12},
    ].map((t, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: t.l,
          top: t.t,
          width: 120,
          height: 34,
          background: 'rgba(236,228,205,0.72)',
          border: '1px solid rgba(0,0,0,0.05)',
          transform: `rotate(${t.r + rnd(`${seed}tape${i}`, -4, 4)}deg)`,
        }}
      />
    ))}
  </div>
);
