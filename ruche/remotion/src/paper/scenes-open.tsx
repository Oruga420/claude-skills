import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Spec} from '../types';
import {PrintPlate} from './ground';
import {DotField, Stroke, curve, segment} from './marks';
import {Score, accumulated, boilTick, cueLines, cutIndex, inPause, spokenAt} from './score';
import {Echo, Label, LetterRun, Marginalia, Stamp} from './type';
import {F, P, clamp01, fitSize, snap, textWidth} from './tokens';

type Props = {sc: Score; frame: number; spec: Spec};

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * TITLE. Visual silence first: an empty sheet and one signal dot. The title words are stamped
 * as they are spoken, one per line, enormous. When the last word lands, the dot travels to
 * sit after it: the first motif becomes punctuation.
 */
export const TitleScene: React.FC<Props> = ({sc, frame, spec}) => {
  const title = sc.scene.heading || spec.title;
  const ws = words(title);
  const longest = ws.reduce((m, w) => Math.max(m, w.length), 1);
  const size = Math.min(260, fitSize('x'.repeat(longest), 1500, 260), 820 / Math.max(1, ws.length));
  const cues = ws.map((w, i) => spokenAt(sc.scene.words, w, 14 + i * 9));
  const lastAt = Math.max(...cues);
  const travel = snap(frame, lastAt + 6, 9);
  const top = 540 - (ws.length * size * 0.92) / 2;
  const dotX = 960 + (130 + textWidth(ws[ws.length - 1] ?? '', size) + size * 0.16 - 960) * travel;
  const dotY = 540 + (top + (ws.length - 1) * size * 0.92 + size * 0.66 - 540) * travel;
  const sub = snap(frame, lastAt + 18, 8);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 130, top}}>
        {ws.map((w, i) => (
          <div key={i}>
            <Stamp text={w} at={cues[i]} frame={frame} size={size} seed={`t${i}`} tilt={0.8} />
          </div>
        ))}
      </div>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <circle cx={dotX} cy={dotY} r={frame < 4 ? 0 : size * 0.09 + 4 * (1 - travel)} fill={P.signal} />
      </svg>
      <div
        style={{
          position: 'absolute',
          right: 130,
          bottom: 120,
          maxWidth: 760,
          textAlign: 'right',
          fontFamily: F.serif,
          fontSize: 50,
          lineHeight: 1.12,
          color: P.ink,
          opacity: sub,
          transform: `translateY(${(1 - sub) * 16}px)`,
        }}
      >
        {spec.subtitle}
      </div>
      <Label text={spec.date} x={130} y={980} color={P.pencil} />
    </AbsoluteFill>
  );
};

/**
 * CONTEXT. Sparse and editorial. The heading is set far too big for the sheet and bleeds off
 * the right edge, drifting slowly left as if the page were being read. The thread enters
 * from the left margin and stops at a dot: the timeline starts here.
 */
export const ContextScene: React.FC<Props> = ({sc, frame}) => {
  const tick = boilTick(sc, frame);
  const {heading, bullets, image, frames} = sc.scene;
  const size = Math.min(330, Math.max(210, 5200 / Math.max(6, heading.length)));
  const drift = -frame * 0.9;
  const cues = cueLines(sc, bullets, 18);
  const thread = clamp01((frame - 6) / 26);
  return (
    <AbsoluteFill>
      <LetterRun text={heading} at={4} frame={frame} size={size} per={1} style={{position: 'absolute', left: 150 + drift, top: 150}} />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <Stroke pts={segment([-20, 700], [560, 700], 14)} seed="ctx-thread" tick={tick} progress={thread} width={5} />
        <circle cx={560} cy={700} r={thread >= 1 ? 16 : 0} fill={P.signal} />
      </svg>
      <div style={{position: 'absolute', left: 150, top: 770, width: 900}}>
        {bullets.map((b, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 22,
              fontFamily: F.mono,
              fontSize: 27,
              lineHeight: 1.35,
              marginBottom: 14,
              color: P.ink,
              opacity: frame >= cues[i] ? 1 : 0,
            }}
          >
            <span style={{color: P.signal}}>{String(i + 1).padStart(2, '0')}</span>
            <span>{b}</span>
          </div>
        ))}
      </div>
      {image ? (
        <PrintPlate
          src={image}
          x={1180}
          y={560 + (1 - snap(frame, 20, 6)) * 60}
          w={560}
          h={380}
          rot={-2.5}
          tone="ink"
          seed="ctx-plate"
          style={{opacity: frame >= 20 ? 1 : 0}}
        />
      ) : null}
      <Marginalia sc={sc} frame={frame} x={1180} y={image ? 470 : 780} w={600} />
      <Label text={`contexto / ${Math.round(frames / 30)}s`} x={150} y={100} color={P.pencil} />
    </AbsoluteFill>
  );
};

const FRAMINGS = [
  {s: 1, x: 0, y: 0},
  {s: 1.07, x: -60, y: 24},
  {s: 1, x: 0, y: 0},
  {s: 1.12, x: 70, y: -30},
];

/**
 * BEAT. Accumulation. Dots pile up with the sound that has been heard (integrated, never
 * bouncing); each beat starts with more of them than the last, so complexity rises across
 * the piece. The heading is re-printed once per bullet (iteration). Bullets are index cards
 * slapped onto the sheet the moment their keyword is said. Onsets in the audio become hard
 * reframes; in a pause the drawing freezes and the field dims: visual silence.
 */
export const BeatScene: React.FC<Props> = ({sc, frame}) => {
  const tick = boilTick(sc, frame);
  const {heading, bullets, image} = sc.scene;
  const n = Math.max(1, sc.scene.beat ?? 1);
  const pause = inPause(sc, frame);
  const heard = accumulated(sc, frame);
  const count = 24 * n + heard * (9 + 5 * n);
  const cues = cueLines(sc, bullets, 16);
  const echo = [2, ...cues];
  const cut = FRAMINGS[cutIndex(sc, frame) % FRAMINGS.length];
  const size = fitSize(heading, image ? 1000 : 1560, 190, 70);
  const side = n % 2 === 0;
  return (
    <AbsoluteFill style={{transform: `scale(${cut.s}) translate(${cut.x}px, ${cut.y}px)`}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: pause ? 0.35 : 1}}>
        <DotField count={count} seed={`beat${n}`} tick={tick} box={[90, 90, 1740, 900]} r={6 + n} still={!!pause} />
        <Stroke
          pts={curve([-20, 1000], [700, 860 - 60 * n], [1940, 960], 22)}
          seed={`beat-thread${n}`}
          tick={tick}
          width={4}
          progress={clamp01(frame / 40)}
        />
      </svg>
      {image ? (
        <PrintPlate
          src={image}
          x={side ? 110 : 1060}
          y={250}
          w={760}
          h={520}
          rot={side ? 2 : -2}
          seed={`beat-plate${n}`}
          style={{opacity: frame >= 8 ? 1 : 0, transform: `rotate(${side ? 2 : -2}deg) scale(${1.1 - 0.1 * snap(frame, 8, 5)})`}}
        />
      ) : null}
      <Echo
        text={heading}
        cues={echo}
        frame={frame}
        size={size}
        step={side ? -size * 0.5 : size * 0.5}
        style={{position: 'absolute', left: side && image ? 920 : 110, top: side ? 1080 - 150 - size : 110}}
      />
      {bullets.map((b, i) => {
        if (frame < cues[i]) return null;
        const k = snap(frame, cues[i], 4);
        const rot = ((i * 37) % 7) - 3;
        const left = side ? (image ? 960 : 1000) + i * 50 : 150 + i * 70;
        const top = side ? 120 + i * 118 : 560 + i * 118;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left,
              top,
              maxWidth: 820,
              padding: '16px 24px',
              background: P.paper,
              border: `2.5px solid ${P.ink}`,
              boxShadow: `7px 7px 0 ${P.ink}`,
              fontFamily: F.mono,
              fontSize: 28,
              lineHeight: 1.3,
              color: P.ink,
              transform: `rotate(${rot}deg) scale(${1.25 - 0.25 * k})`,
            }}
          >
            {b}
          </div>
        );
      })}
      <Marginalia sc={sc} frame={frame} x={side ? 110 : 1260} y={side ? 110 : 60} w={560} align={side ? 'left' : 'right'} />
      <Label text={`paso ${String(n).padStart(2, '0')} / densidad ${Math.round(count)}`} x={110} y={975} color={P.pencil} />
    </AbsoluteFill>
  );
};
