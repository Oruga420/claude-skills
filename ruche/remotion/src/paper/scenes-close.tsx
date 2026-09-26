import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Spec} from '../types';
import {PrintPlate} from './ground';
import {Check, Cross, DotField, Stroke, curve, ellipse, segment} from './marks';
import {Score, accumulated, boilTick, cueLines, cutIndex, spokenAt} from './score';
import {Label, Marginalia, Stamp} from './type';
import {F, P, clamp01, fitSize, snap} from './tokens';

type Props = {sc: Score; frame: number; spec: Spec};

/** A bullet written as "x algo" is a discarded option (decision) or a failure (result). */
const isOut = (b: string) => /^\s*(x|✗|✕)\s+/i.test(b);
const strip = (b: string) => b.replace(/^\s*(x|✗|✕)\s+/i, '');

/**
 * DECISION. The thread becomes a diagram: it reaches a node and forks. The chosen branch is
 * drawn in signal ink and ends at the decision itself, set in the serif (the one moment the
 * piece speaks in a human hand). The other branch is drafted in pencil and crossed out.
 */
export const DecisionScene: React.FC<Props> = ({sc, frame}) => {
  const tick = boilTick(sc, frame);
  const {heading, bullets, image} = sc.scene;
  const kept = bullets.filter((b) => !isOut(b));
  const dropped = bullets.filter(isOut).map(strip);
  const cues = cueLines(sc, kept, 30);
  const node: [number, number] = [640, 560];
  const toNode = clamp01((frame - 2) / 18);
  const fork = clamp01((frame - 18) / 22);
  const headAt = spokenAt(sc.scene.words, heading.split(/\s+/)[0] ?? '', 34);
  const crossAt = dropped.length ? spokenAt(sc.scene.words, dropped[0], Math.max(46, sc.scene.frames * 0.55)) : Math.max(46, sc.scene.frames * 0.55);
  const size = fitSize(heading, 700, 104, 56, 0.42);
  return (
    <AbsoluteFill>
      {image ? <PrintPlate src={image} x={120} y={120} w={420} h={300} rot={-3} tone="ink" seed="dec-plate" /> : null}
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <Stroke pts={segment([-20, 560], node, 12)} seed="dec-in" tick={tick} progress={toNode} width={5} />
        <Stroke pts={curve(node, [860, 330], [1150, 300])} seed="dec-keep" tick={tick} progress={fork} width={frame >= headAt ? 9 : 5} color={frame >= headAt ? P.signal : P.ink} />
        <Stroke pts={curve(node, [860, 800], [1150, 820])} seed="dec-drop" tick={tick} progress={fork} width={4} color={P.pencil} />
        <circle cx={node[0]} cy={node[1]} r={toNode >= 1 ? 18 : 0} fill={P.ink} />
        <circle cx={1150} cy={300} r={fork >= 1 ? 13 : 0} fill={P.signal} />
        <circle cx={1150} cy={820} r={fork >= 1 ? 10 : 0} fill="none" stroke={P.pencil} strokeWidth={3} />
        <Cross a={[1110, 780]} b={[1190, 860]} progress={clamp01((frame - crossAt) / 10)} tick={tick} seed="dec-x" width={8} />
      </svg>
      <div style={{position: 'absolute', left: 1200, top: 300 - size * 0.9, width: 640}}>
        <Stamp text={heading} at={headAt} frame={frame} size={size} font={F.serif} seed="dec-h" misreg={false} style={{whiteSpace: 'normal', lineHeight: 1}} />
      </div>
      <div style={{position: 'absolute', left: 1210, top: 400, width: 620}}>
        {kept.map((b, i) => (
          <div key={i} style={{fontFamily: F.mono, fontSize: 24, lineHeight: 1.4, marginBottom: 12, color: P.ink, opacity: frame >= cues[i] ? 1 : 0}}>
            <span style={{color: P.signal}}>+ </span>
            {b}
          </div>
        ))}
      </div>
      {dropped.length ? (
        <div style={{position: 'absolute', left: 1220, top: 800, width: 600, fontFamily: F.mono, fontSize: 24, color: P.pencil, opacity: fork >= 1 ? 1 : 0}}>
          {dropped[0]}
        </div>
      ) : null}
      <Marginalia sc={sc} frame={frame} x={120} y={image ? 470 : 200} w={440} />
      <Label text="decision" x={120} y={1000} color={P.pencil} />
    </AbsoluteFill>
  );
};

/**
 * RESULT. The inversion: ink sheet, paper-colored type. Everything that piled up loose in the
 * beats now falls into a strict grid, all at once (synchronization). Each claim is ticked by
 * hand when it is said; a claim written as "x ..." gets a cross instead, because the video
 * never pretends something worked.
 */
export const ResultScene: React.FC<Props> = ({sc, frame}) => {
  const tick = boilTick(sc, frame);
  const {heading, bullets} = sc.scene;
  const cues = cueLines(sc, bullets, 26);
  const order = snap(frame, 6, 30);
  const count = 96 + accumulated(sc, frame) * 4;
  const size = fitSize(heading, 1000, 170, 70);
  const cut = cutIndex(sc, frame, 36) % 2 === 1;
  return (
    <AbsoluteFill style={{transform: cut ? 'scale(1.05) translate(-30px, 10px)' : undefined}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <DotField count={count} seed="result" tick={tick} order={order} box={[1180, 130, 620, 820]} color={P.paper} r={8} every={7} />
      </svg>
      <div style={{position: 'absolute', left: 120, top: 130, width: 1020}}>
        <Stamp text={heading} at={4} frame={frame} size={size} color={P.paper} seed="res-h" style={{whiteSpace: 'normal'}} />
      <div style={{marginTop: 90, width: 980}}>
        {bullets.map((b, i) => {
          const out = isOut(b);
          const p = clamp01((frame - cues[i]) / 8);
          return (
            <div key={i} style={{position: 'relative', paddingLeft: 86, marginBottom: 26, minHeight: 56}}>
              <svg width={70} height={70} style={{position: 'absolute', left: 0, top: -6, overflow: 'visible'}}>
                <rect x={4} y={8} width={50} height={50} fill="none" stroke={P.paper} strokeWidth={2.5} opacity={0.5} />
                {out ? (
                  <Cross a={[10, 14]} b={[50, 54]} progress={p} tick={tick} seed={`rx${i}`} width={7} />
                ) : (
                  <Check x={8} y={6} s={54} progress={p} tick={tick} seed={`rc${i}`} />
                )}
              </svg>
              <div style={{fontFamily: F.mono, fontSize: 30, lineHeight: 1.3, color: P.paper, opacity: frame >= cues[i] - 6 ? 1 : 0.18}}>
                {strip(b)}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      <Marginalia sc={sc} frame={frame} x={1180} y={60} w={620} color={P.paper} align="right" />
    </AbsoluteFill>
  );
};

/**
 * OUTRO. Compression. The grid from the result folds back into a single dot, the same dot
 * the title opened with. It gets circled by hand and an arrow leaves the frame toward what
 * comes next. The last second is visual silence: only the dot is left on the sheet.
 */
export const OutroScene: React.FC<Props> = ({sc, frame}) => {
  const tick = boilTick(sc, frame);
  const {heading, bullets, frames} = sc.scene;
  const collapse = snap(frame, frames * 0.18, Math.max(12, frames * 0.25));
  const circle = clamp01((frame - frames * 0.45) / 16);
  const arrow = clamp01((frame - frames * 0.45 - 12) / 14);
  const silence = 1 - clamp01((frame - (frames - 30)) / 10);
  const dot: [number, number] = [1440, 560];
  const size = fitSize(heading, 1000, 120, 60, 0.42);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <g opacity={collapse < 1 ? 1 : 0}>
          <DotField count={96} seed="result" tick={tick} order={1} collapse={collapse} box={[1180, 130, 620, 820]} target={dot} r={8} every={7} />
        </g>
        <circle cx={dot[0]} cy={dot[1]} r={collapse >= 1 ? 22 : 0} fill={P.signal} />
        <g opacity={silence}>
          <Stroke pts={ellipse(dot[0], dot[1], 92, 70)} seed="out-circle" tick={tick} progress={circle} width={5} />
          <Stroke pts={segment([dot[0] + 110, dot[1] - 10], [1960, dot[1] - 90], 10)} seed="out-arrow" tick={tick} progress={arrow} width={5} />
        </g>
      </svg>
      <div style={{position: 'absolute', left: 130, top: 330, width: 1000, opacity: silence}}>
        <Label text="siguiente" x={0} y={-60} color={P.signal} />
        <Stamp text={heading} at={6} frame={frame} size={size} font={F.serif} seed="out-h" misreg={false} style={{whiteSpace: 'normal', lineHeight: 1.02}} />
        <div style={{marginTop: 40}}>
          {bullets.map((b, i) => (
            <div key={i} style={{fontFamily: F.mono, fontSize: 26, lineHeight: 1.5, color: P.ink, opacity: frame >= 20 + i * 10 ? 1 : 0}}>
              {b}
            </div>
          ))}
        </div>
      </div>
      <div style={{opacity: silence}}>
        <Marginalia sc={sc} frame={frame} x={130} y={900} w={900} />
      </div>
    </AbsoluteFill>
  );
};
