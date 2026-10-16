import React, {createContext, useContext} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Two themes share one component tree:
 *  - dark   : the original terminal-style look (default; nothing changes for existing specs)
 *  - cutout : newspaper cutout / mixed media look, kraft paper, ink, teal accent, torn panels,
 *             with an optional generated video plate behind every scene (spec.plates).
 */
export type ThemeName = 'dark' | 'cutout';

export type Theme = {
  name: ThemeName;
  bg0: string;
  bg1: string;
  panel: string;
  stroke: string;
  text: string;
  dim: string;
  faint: string;
  green: string;
  red: string;
  amber: string;
  purple: string;
  blue: string;
  cyan: string;
  mono: string;
  sans: string;
  /** headline face; same as sans on dark, a serif on cutout */
  display: string;
  /** squared corners and stamps on cutout, rounded on dark */
  radius: number;
  pillRadius: number;
};

export const darkTheme: Theme = {
  name: 'dark',
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
  display: "'Segoe UI','Inter',system-ui,-apple-system,sans-serif",
  radius: 16,
  pillRadius: 999,
};

export const cutoutTheme: Theme = {
  name: 'cutout',
  bg0: '#e9dfcc', // kraft paper
  bg1: '#f4ede0', // newsprint
  panel: 'rgba(247,241,229,0.94)',
  stroke: '#2b2622',
  text: '#1b1917', // ink
  dim: '#4a4542',
  faint: '#7b746a',
  green: '#2f7d4f',
  red: '#b8322a',
  amber: '#b9781a',
  purple: '#5f4b8b',
  blue: '#2f5f8f',
  cyan: '#087c70', // the one accent: teal
  mono: "'Courier New','Courier',monospace",
  sans: "'Segoe UI','Inter',system-ui,-apple-system,sans-serif",
  display: "Georgia,'Times New Roman',serif",
  radius: 4,
  pillRadius: 4,
};

export const themes: Record<ThemeName, Theme> = {dark: darkTheme, cutout: cutoutTheme};

/** Kept for backwards compatibility: the original constant object. */
export const theme = darkTheme;

const ThemeContext = createContext<Theme>(darkTheme);
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => useContext(ThemeContext);

export const accentFor = (mode: string, t: Theme = darkTheme) =>
  mode === 'full' ? t.amber : t.cyan;

/** Fade + rise, clamped both ends. */
export const useIn = (start: number, dur = 14, rise = 22) => {
  const frame = useCurrentFrame();
  const o = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  return {
    opacity: interpolate(frame, [start, start + dur], [0, 1], o),
    transform: `translateY(${interpolate(frame, [start, start + dur], [rise, 0], o)}px)`,
  };
};

/**
 * Cutout variant of useIn: the element is "pasted" on the page, so it lands with a tiny
 * rotation and settles. Deterministic per call site through `tilt`.
 */
export const usePaste = (start: number, dur = 14, tilt = -1.5) => {
  const frame = useCurrentFrame();
  const o = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const p = interpolate(frame, [start, start + dur], [0, 1], o);
  const eased = 1 - Math.pow(1 - p, 3);
  return {
    opacity: interpolate(p, [0, 0.6], [0, 1], o),
    transform: `translateY(${(1 - eased) * 26}px) rotate(${tilt + (1 - eased) * 4}deg) scale(${0.96 + eased * 0.04})`,
    transformOrigin: 'left top',
  } as React.CSSProperties;
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
}) => {
  const t = useTheme();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(120% 90% at 12% 0%, ${t.bg1} 0%, ${t.bg0} 62%)`,
        fontFamily: t.sans,
        color: t.text,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(${t.stroke}22 1px, transparent 1px), linear-gradient(90deg, ${t.stroke}22 1px, transparent 1px)`,
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
};

export const SceneTitle: React.FC<{kicker: string; title: string; accent: string}> = ({
  kicker,
  title,
  accent,
}) => {
  const t = useTheme();
  const a = useIn(0, 12);
  const cut = t.name === 'cutout';
  return (
    <div style={{position: 'absolute', left: 110, top: 92, ...a}}>
      <div
        style={{
          fontFamily: t.mono,
          fontSize: 22,
          letterSpacing: 4,
          color: cut ? t.bg1 : accent,
          background: cut ? accent : 'transparent',
          display: 'inline-block',
          padding: cut ? '4px 12px' : 0,
          transform: cut ? 'rotate(-1.2deg)' : 'none',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontFamily: t.display,
          fontSize: 62,
          fontWeight: 700,
          letterSpacing: cut ? -0.5 : -1,
          color: t.text,
        }}
      >
        {title}
      </div>
      <div
        style={{
          width: 92,
          height: cut ? 6 : 4,
          background: accent,
          borderRadius: cut ? 1 : 2,
          marginTop: 20,
          transform: cut ? 'rotate(-1deg)' : 'none',
        }}
      />
    </div>
  );
};

/**
 * A jagged polygon used as clip-path so panels read as torn paper. Deterministic (seeded)
 * so renders are stable frame to frame and run to run.
 */
export const tornEdge = (seed = 1, teeth = 28, depth = 1.4): string => {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) pts.push(`${(i / teeth) * 100}% ${(rnd() * depth).toFixed(2)}%`);
  for (let i = 0; i <= teeth; i++) pts.push(`${(100 - (rnd() * depth) / 2).toFixed(2)}% ${(i / teeth) * 100}%`);
  for (let i = teeth; i >= 0; i--) pts.push(`${(i / teeth) * 100}% ${(100 - rnd() * depth).toFixed(2)}%`);
  for (let i = teeth; i >= 0; i--) pts.push(`${((rnd() * depth) / 2).toFixed(2)}% ${(i / teeth) * 100}%`);
  return `polygon(${pts.join(', ')})`;
};

export const Panel: React.FC<{
  start?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  seed?: number;
}> = ({start = 0, style, children, seed = 3}) => {
  const t = useTheme();
  const a = useIn(start);
  const paste = usePaste(start, 14, -0.8);
  if (t.name === 'cutout') {
    return (
      <div style={{...paste, ...style, filter: 'drop-shadow(6px 8px 0 rgba(27,25,23,0.18))'}}>
        <div
          style={{
            background: t.panel,
            clipPath: tornEdge(seed, 34, 1.8),
            padding: '26px 32px',
            boxSizing: 'border-box',
            backgroundImage:
              'radial-gradient(rgba(27,25,23,0.06) 0.8px, transparent 0.9px)',
            backgroundSize: '6px 6px',
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        background: t.panel,
        border: `1.5px solid ${t.stroke}`,
        borderRadius: t.radius,
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
}) => {
  const t = useTheme();
  const cut = t.name === 'cutout';
  return (
    <span
      style={{
        fontFamily: t.mono,
        fontSize: size,
        fontWeight: 700,
        color,
        border: `${cut ? 3 : 1.5}px solid ${color}`,
        background: cut ? 'rgba(255,255,255,0.35)' : `${color}1a`,
        borderRadius: t.pillRadius,
        padding: cut ? '3px 12px' : '4px 14px',
        letterSpacing: cut ? 2 : 1,
        whiteSpace: 'nowrap',
        display: 'inline-block',
        transform: cut ? 'rotate(-3deg)' : 'none',
        textTransform: cut ? 'uppercase' : 'none',
        textShadow: cut ? `0 0 0.6px ${color}` : 'none',
      }}
    >
      {text}
    </span>
  );
};

export const verdictColor = (v: string, t: Theme = darkTheme) =>
  v === 'KILLED' ? t.red : v === 'FIXED' ? t.amber : v === 'SURVIVED' ? t.green : t.purple;

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
  const t = useTheme();
  const a = useIn(start);
  if (rest <= 0) return null;
  return (
    <div style={{...a, fontFamily: t.mono, fontSize: 20, color: t.faint, marginTop: 10}}>
      + {rest} {word} en el HTML
    </div>
  );
};
