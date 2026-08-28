import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

export const theme = {
  bg: '#0b0f14',
  panel: '#111823',
  stroke: '#3d4a5c',
  text: '#e6edf3',
  dim: '#8b98a9',
  blue: '#58a6ff',
  green: '#3fb950',
  orange: '#f0883e',
  red: '#f85149',
  purple: '#bc8cff',
  yellow: '#e3b341',
  font: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
};

export type Pt = [number, number];

export const useFadeIn = (start: number, dur = 15) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [start, start + dur], [18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {opacity, transform: `translateY(${y}px)`};
};

export const Box: React.FC<{
  x: number;
  y: number;
  w: number;
  h?: number;
  title: string;
  color?: string;
  start?: number;
  dashed?: boolean;
  children?: React.ReactNode;
  titleSize?: number;
}> = ({x, y, w, h, title, color = theme.text, start = 0, dashed, children, titleSize = 26}) => {
  const fade = useFadeIn(start);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        border: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}`,
        borderRadius: 14,
        background: `${theme.panel}ee`,
        padding: '14px 20px',
        fontFamily: theme.font,
        color: theme.text,
        boxSizing: 'border-box',
        ...fade,
      }}
    >
      <div style={{fontSize: titleSize, fontWeight: 700, color, marginBottom: children ? 8 : 0, letterSpacing: 1}}>
        {title}
      </div>
      {children}
    </div>
  );
};

export const Line: React.FC<{text: string; color?: string; size?: number}> = ({
  text,
  color = theme.dim,
  size = 20,
}) => (
  <div style={{fontSize: size, color, lineHeight: 1.55, fontFamily: theme.font}}>{text}</div>
);

const pathLength = (points: Pt[]) => {
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    segs.push(d);
    total += d;
  }
  return {total, segs};
};

const pointAt = (points: Pt[], t: number): Pt => {
  const {total, segs} = pathLength(points);
  let dist = t * total;
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const f = segs[i] === 0 ? 0 : dist / segs[i];
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * f,
        points[i][1] + (points[i + 1][1] - points[i][1]) * f,
      ];
    }
    dist -= segs[i];
  }
  return points[points.length - 1];
};

/** Animated arrow that draws itself in, with optional label. */
export const Arrow: React.FC<{
  points: Pt[];
  color?: string;
  start?: number;
  drawDur?: number;
  dashed?: boolean;
  width?: number;
}> = ({points, color = theme.stroke, start = 0, drawDur = 20, dashed, width = 3}) => {
  const frame = useCurrentFrame();
  const {total} = pathLength(points);
  const progress = interpolate(frame, [start, start + drawDur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (progress === 0) return null;
  const d = `M ${points.map((p) => p.join(' ')).join(' L ')}`;
  const tip = pointAt(points, progress);
  const before = pointAt(points, Math.max(0, progress - 0.02));
  const angle = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
  const a1: Pt = [tip[0] - 14 * Math.cos(angle - 0.45), tip[1] - 14 * Math.sin(angle - 0.45)];
  const a2: Pt = [tip[0] - 14 * Math.cos(angle + 0.45), tip[1] - 14 * Math.sin(angle + 0.45)];
  return (
    <g>
      <path
        d={d}
        stroke={color}
        strokeWidth={width}
        fill="none"
        strokeDasharray={dashed ? `10 8` : `${total}`}
        strokeDashoffset={dashed ? 0 : total * (1 - progress)}
        opacity={dashed ? progress : 1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={`${tip.join(',')} ${a1.join(',')} ${a2.join(',')}`} fill={color} />
    </g>
  );
};

/** A glowing dot that travels along a polyline, looping. Represents data moving. */
export const Pulse: React.FC<{
  points: Pt[];
  color?: string;
  start?: number;
  dur?: number;
  size?: number;
  repeat?: boolean;
  end?: number;
  phase?: number;
}> = ({points, color = '#58a6ff', start = 0, dur = 60, size = 9, repeat = true, end, phase = 0}) => {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  if (end !== undefined && frame > end) return null;
  const elapsed = frame - start + phase * dur;
  const t = repeat ? (elapsed % dur) / dur : Math.min(1, elapsed / dur);
  const [cx, cy] = pointAt(points, t);
  return (
    <g>
      <circle cx={cx} cy={cy} r={size * 1.9} fill={color} opacity={0.22} />
      <circle cx={cx} cy={cy} r={size} fill={color} />
    </g>
  );
};

export const Caption: React.FC<{text: string; start?: number; y?: number; color?: string}> = ({
  text,
  start = 0,
  y = 990,
  color = theme.text,
}) => {
  const fade = useFadeIn(start);
  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: 0,
        width: '100%',
        textAlign: 'center',
        fontFamily: theme.font,
        fontSize: 30,
        color,
        ...fade,
      }}
    >
      {text}
    </div>
  );
};

export const BigTitle: React.FC<{text: string; sub?: string}> = ({text, sub}) => {
  const fade = useFadeIn(0);
  return (
    <div style={{position: 'absolute', top: 36, left: 60, fontFamily: theme.font, ...fade}}>
      <div style={{fontSize: 44, fontWeight: 800, color: theme.text, letterSpacing: 1}}>{text}</div>
      {sub ? <div style={{fontSize: 24, color: theme.dim, marginTop: 4}}>{sub}</div> : null}
    </div>
  );
};
