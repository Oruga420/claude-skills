import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export const theme = {
  bg0: '#070a0f',
  bg1: '#0d131c',
  panel: 'rgba(19,27,38,0.86)',
  stroke: '#2a3644',
  text: '#eaf1f8',
  dim: '#93a2b5',
  faint: '#5c6b7d',
  green: '#3fb950',
  red: '#f85149',
  amber: '#e3b341',
  purple: '#bc8cff',
  blue: '#58a6ff',
  cyan: '#39d0d8',
  mono: "'Cascadia Code','JetBrains Mono',Consolas,monospace",
  sans: "'Segoe UI','Inter',system-ui,-apple-system,sans-serif",
};

export const accentFor = (mode: string) => (mode === 'full' ? theme.amber : theme.cyan);

/** Fade + rise, clamped both ends. */
export const useIn = (start: number, dur = 14, rise = 22) => {
  const frame = useCurrentFrame();
  const o = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  return {
    opacity: interpolate(frame, [start, start + dur], [0, 1], o),
    transform: `translateY(${interpolate(frame, [start, start + dur], [rise, 0], o)}px)`,
  };
};

/** Fade the whole scene out over its last `dur` frames so cuts never pop. */
export const useSceneFade = (dur = 10) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return interpolate(
    frame,
    [0, 6, durationInFrames - dur, durationInFrames],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
};

export const Backdrop: React.FC<{accent: string; children?: React.ReactNode}> = ({
  accent,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `radial-gradient(120% 90% at 12% 0%, ${theme.bg1} 0%, ${theme.bg0} 62%)`,
      fontFamily: theme.sans,
      color: theme.text,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `linear-gradient(${theme.stroke}22 1px, transparent 1px), linear-gradient(90deg, ${theme.stroke}22 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(80% 70% at 50% 40%, #000 40%, transparent 100%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: -240,
        top: -240,
        width: 900,
        height: 900,
        borderRadius: '50%',
        background: `${accent}1f`,
        filter: 'blur(120px)',
      }}
    />
    {children}
  </div>
);

export const SceneTitle: React.FC<{kicker: string; title: string; accent: string}> = ({
  kicker,
  title,
  accent,
}) => {
  const a = useIn(0, 12);
  return (
    <div style={{position: 'absolute', left: 110, top: 92, ...a}}>
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: 22,
          letterSpacing: 4,
          color: accent,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {kicker}
      </div>
      <div style={{fontSize: 62, fontWeight: 700, letterSpacing: -1}}>{title}</div>
      <div style={{width: 92, height: 4, background: accent, borderRadius: 2, marginTop: 20}} />
    </div>
  );
};

export const Panel: React.FC<{
  start?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({start = 0, style, children}) => {
  const a = useIn(start);
  return (
    <div
      style={{
        background: theme.panel,
        border: `1.5px solid ${theme.stroke}`,
        borderRadius: 16,
        padding: '22px 28px',
        boxSizing: 'border-box',
        ...a,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Pill: React.FC<{text: string; color: string; size?: number}> = ({
  text,
  color,
  size = 19,
}) => (
  <span
    style={{
      fontFamily: theme.mono,
      fontSize: size,
      fontWeight: 700,
      color,
      border: `1.5px solid ${color}`,
      background: `${color}1a`,
      borderRadius: 999,
      padding: '4px 14px',
      letterSpacing: 1,
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </span>
);

export const verdictColor = (v: string) =>
  v === 'KILLED' ? theme.red : v === 'FIXED' ? theme.amber : v === 'SURVIVED' ? theme.green : theme.purple;

/** Clamp a list for the screen and report the overflow. */
export const clampList = <T,>(items: T[], max: number): {shown: T[]; rest: number} => ({
  shown: items.slice(0, max),
  rest: Math.max(0, items.length - max),
});

export const Overflow: React.FC<{rest: number; start: number; word?: string}> = ({
  rest,
  start,
  word = 'mas',
}) => {
  const a = useIn(start);
  if (rest <= 0) return null;
  return (
    <div style={{...a, fontFamily: theme.mono, fontSize: 20, color: theme.faint, marginTop: 10}}>
      + {rest} {word} en el HTML
    </div>
  );
};
