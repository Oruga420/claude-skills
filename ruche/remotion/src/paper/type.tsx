import React from 'react';
import {Score, currentWord} from './score';
import {F, P, clamp01, rnd, snap} from './tokens';

/**
 * Type as a physical object. A stamped word does not fade in: it hits the page oversized,
 * settles in a few hard frames, and its signal-ink pass lands slightly out of register
 * before pulling (almost) into place.
 */
export const Stamp: React.FC<{
  text: string;
  at: number;
  frame: number;
  size: number;
  color?: string;
  font?: string;
  seed: string;
  tilt?: number;
  misreg?: boolean;
  style?: React.CSSProperties;
}> = ({text, at, frame, size, color = P.ink, font = F.display, seed, tilt = 1.2, misreg = true, style}) => {
  if (frame < at) return <span style={{...style, visibility: 'hidden', fontFamily: font, fontSize: size}}>{text}</span>;
  const k = snap(frame, at, 5);
  const scale = 1.32 - 0.32 * k;
  const off = 11 - 8 * k;
  const rot = rnd(`${seed}rot`, -tilt, tilt);
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: font,
        fontSize: size,
        lineHeight: 0.92,
        letterSpacing: font === F.display ? -size * 0.035 : 0,
        color,
        transform: `rotate(${rot}deg) scale(${scale})`,
        transformOrigin: '30% 70%',
        textShadow: misreg ? `${off}px ${off * 0.55}px 0 ${P.signal}` : undefined,
        whiteSpace: 'pre',
        ...style,
      }}
    >
      {text}
    </span>
  );
};

/** Letter by letter, each letter dropping onto the line: for words that are being built. */
export const LetterRun: React.FC<{
  text: string;
  at: number;
  frame: number;
  size: number;
  per?: number;
  color?: string;
  font?: string;
  style?: React.CSSProperties;
}> = ({text, at, frame, size, per = 2, color = P.ink, font = F.display, style}) => (
  <div
    style={{
      fontFamily: font,
      fontSize: size,
      lineHeight: 0.9,
      letterSpacing: font === F.display ? -size * 0.04 : 0,
      color,
      whiteSpace: 'pre',
      ...style,
    }}
  >
    {text.split('').map((ch, i) => {
      const t = at + i * per;
      const k = snap(frame, t, 3);
      return (
        <span key={i} style={{display: 'inline-block', opacity: frame < t ? 0 : 1, transform: `translateY(${(1 - k) * -size * 0.12}px)`}}>
          {ch}
        </span>
      );
    })}
  </div>
);

/**
 * Repetition as iteration: the same word printed again and again below itself in outline,
 * one pass per cue. The solid copy is the latest version; the outlines are its history.
 */
export const Echo: React.FC<{
  text: string;
  cues: number[];
  frame: number;
  size: number;
  step: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({text, cues, frame, size, step, color = P.ink, style}) => {
  const shown = cues.filter((c) => c <= frame).length;
  return (
    <div style={{position: 'relative', ...style}}>
      {cues.map((c, i) => {
        if (i >= shown) return null;
        const solid = i === shown - 1;
        const k = snap(frame, c, 4);
        return (
          <div
            key={i}
            style={{
              position: i === 0 ? 'relative' : 'absolute',
              left: 0,
              top: i * step,
              fontFamily: F.display,
              fontSize: size,
              lineHeight: 0.92,
              letterSpacing: -size * 0.035,
              whiteSpace: 'pre',
              color: solid ? color : 'transparent',
              WebkitTextStroke: solid ? undefined : `2px ${color}`,
              opacity: solid ? 1 : 0.18 + 0.6 * (i / Math.max(1, shown)),
              transform: `translateX(${(1 - k) * 40}px)`,
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
};

const PHRASE_END = /[.,;:?!]$/;

/**
 * Marginalia: the narration as a small running note at the edge of the page, never as a
 * subtitle. Only the current phrase is shown; the spoken word carries a signal underline,
 * words still to come sit in pencil.
 */
export const Marginalia: React.FC<{
  sc: Score;
  frame: number;
  x: number;
  y: number;
  w: number;
  color?: string;
  align?: 'left' | 'right';
}> = ({sc, frame, x, y, w, color = P.ink, align = 'left'}) => {
  const ws = sc.scene.words ?? [];
  const k = currentWord(sc, frame);
  if (k < 0) return null;
  let a = k;
  while (a > 0 && !PHRASE_END.test(ws[a - 1].w)) a--;
  let b = k;
  while (b < ws.length - 1 && !PHRASE_END.test(ws[b].w)) b++;
  const phrase = ws.slice(a, b + 1);
  const fade = clamp01((frame - ws[a].s + 3) / 3);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        fontFamily: F.mono,
        fontSize: 21,
        lineHeight: 1.55,
        textAlign: align,
        color,
        opacity: fade,
      }}
    >
      <span style={{color: P.signal}}>{'→ '}</span>
      {phrase.map((wd, i) => {
        const idx = a + i;
        const now = idx === k && frame <= wd.e + 4;
        const said = idx <= k;
        return (
          <span
            key={idx}
            style={{
              opacity: said ? 1 : 0.28,
              boxShadow: now ? `inset 0 -7px 0 ${P.signal}` : undefined,
            }}
          >
            {wd.w}{' '}
          </span>
        );
      })}
    </div>
  );
};

/** Tiny mono label, the editorial voice of the system: numbers, kinds, counters. */
export const Label: React.FC<{text: string; x: number; y: number; color?: string; size?: number; style?: React.CSSProperties}> = ({
  text,
  x,
  y,
  color = P.ink,
  size = 18,
  style,
}) => (
  <div style={{position: 'absolute', left: x, top: y, fontFamily: F.mono, fontSize: size, letterSpacing: 3, color, textTransform: 'uppercase', ...style}}>
    {text}
  </div>
);
