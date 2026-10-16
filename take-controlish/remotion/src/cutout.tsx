import React from 'react';
import {
  AbsoluteFill,
  Loop,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {tornEdge, useTheme} from './ui';

/**
 * Newspaper cutout / mixed media backdrop.
 *
 *  layer 0  generated video plate (Seedance), slowly drifting, muted, looped
 *  layer 1  kraft paper wash so the type stays legible over any plate
 *  layer 2  halftone dots + paper grain
 *  layer 3  a torn newsprint sheet where the content lives, with two pieces of tape
 *  layer 4  children (the scene body)
 */
export const CutoutBackdrop: React.FC<{
  accent: string;
  plate?: {file: string; frames: number} | null;
  seed?: number;
  /** how opaque the torn sheet is over the plate (title and status let more of it through) */
  sheetAlpha?: number;
  children?: React.ReactNode;
}> = ({accent, plate, seed = 7, sheetAlpha = 0.9, children}) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  // the plate breathes: a slow push-in so a 10 s loop never reads as a still
  const zoom = interpolate(frame, [0, durationInFrames], [1.04, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sheetIn = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sheetEase = 1 - Math.pow(1 - sheetIn, 3);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#cfbf9f',
        fontFamily: t.sans,
        color: t.text,
        overflow: 'hidden',
      }}
    >
      {plate ? (
        <AbsoluteFill style={{transform: `scale(${zoom})`, transformOrigin: '50% 45%'}}>
          <Loop durationInFrames={Math.max(1, plate.frames)}>
            <OffthreadVideo
              src={staticFile(plate.file)}
              muted
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
          </Loop>
        </AbsoluteFill>
      ) : null}
      {/* paper wash: keeps the plate as texture, never as competition for the text */}
      <AbsoluteFill
        style={{
          background: plate
            ? `linear-gradient(180deg, ${t.bg0}cc 0%, ${t.bg0}99 45%, ${t.bg0}d9 100%)`
            : 'radial-gradient(120% 90% at 20% 0%, #dccdaf 0%, #c9b893 70%)',
        }}
      />
      {/* halftone + grain */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(rgba(27,25,23,0.10) 0.9px, transparent 1px), repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)',
          backgroundSize: '7px 7px, 100% 3px',
          mixBlendMode: 'multiply',
          opacity: 0.9,
        }}
      />
      {/* the torn sheet */}
      <div
        style={{
          position: 'absolute',
          left: 80,
          top: 56,
          right: 80,
          bottom: 56,
          transform: `rotate(${-0.6 + (1 - sheetEase) * 2}deg) translateY(${(1 - sheetEase) * 40}px)`,
          transformOrigin: '50% 50%',
          opacity: sheetEase,
          filter: 'drop-shadow(14px 18px 0 rgba(27,25,23,0.30))',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `rgba(246,240,228,${sheetAlpha})`,
            clipPath: tornEdge(seed, 46, 1.3),
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(27,25,23,0.035) 0 1px, transparent 1px 22px), radial-gradient(rgba(27,25,23,0.05) 0.7px, transparent 0.8px), linear-gradient(160deg, rgba(255,250,240,0.55) 0%, rgba(241,233,217,0.2) 60%, rgba(220,208,185,0.35) 100%)',
            backgroundSize: '100% 100%, 5px 5px, 100% 100%',
          }}
        />
        {/* faint column rules like a newspaper page */}
        <div
          style={{
            position: 'absolute',
            inset: '120px 48px 60px 48px',
            backgroundImage:
              'repeating-linear-gradient(180deg, rgba(27,25,23,0.045) 0 1px, transparent 1px 11px)',
            maskImage: 'linear-gradient(90deg, transparent 0 55%, #000 62%, #000 100%)',
            opacity: 0.6,
          }}
        />
        {/* tape */}
        <Tape left={120} top={-14} rotate={-6} accent={accent} />
        <Tape right={160} bottom={-16} rotate={5} accent={accent} />
      </div>
      {children}
    </div>
  );
};

const Tape: React.FC<{
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  rotate: number;
  accent: string;
}> = ({left, right, top, bottom, rotate, accent}) => (
  <div
    style={{
      position: 'absolute',
      left,
      right,
      top,
      bottom,
      width: 150,
      height: 36,
      background: `${accent}55`,
      border: `1px solid ${accent}33`,
      transform: `rotate(${rotate}deg)`,
      backdropFilter: 'blur(0.5px)',
      boxShadow: '0 1px 0 rgba(27,25,23,0.15)',
    }}
  />
);

/** A round paper disc (the "cut-out number" on phases and the seal on the contract). */
export const PaperDisc: React.FC<{
  size: number;
  color: string;
  ink?: string;
  children?: React.ReactNode;
  rotate?: number;
}> = ({size, color, ink = '#f7f1e5', children, rotate = -4}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      color: ink,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transform: `rotate(${rotate}deg)`,
      boxShadow: '3px 4px 0 rgba(27,25,23,0.22)',
      clipPath: tornEdge(size, 20, 3),
      fontWeight: 700,
    }}
  >
    {children}
  </div>
);

/** A rubber-stamp word (judge verdicts, status badge). */
export const Stamp: React.FC<{text: string; color: string; size?: number; rotate?: number}> = ({
  text,
  color,
  size = 20,
  rotate = -4,
}) => {
  const t = useTheme();
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: t.mono,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color,
        border: `3px solid ${color}`,
        padding: '4px 12px',
        transform: `rotate(${rotate}deg)`,
        opacity: 0.92,
        maskImage:
          'radial-gradient(rgba(0,0,0,1) 60%, rgba(0,0,0,0.75) 100%), repeating-linear-gradient(45deg, #000 0 3px, rgba(0,0,0,0.85) 3px 5px)',
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      }}
    >
      {text}
    </span>
  );
};
