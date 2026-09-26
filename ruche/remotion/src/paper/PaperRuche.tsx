import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Scene, Spec} from '../types';
import {PaperGround, SheetMarks} from './ground';
import {Stroke, segment} from './marks';
import {Score, boilTick, buildAcc} from './score';
import {BeatScene, ContextScene, TitleScene} from './scenes-open';
import {DecisionScene, OutroScene, ResultScene} from './scenes-close';
import {P, clamp01} from './tokens';

const BODY = {
  title: TitleScene,
  context: ContextScene,
  beat: BeatScene,
  decision: DecisionScene,
  result: ResultScene,
  outro: OutroScene,
} as const;

/** The thread along the foot of every sheet: how far into the piece we are, drawn by hand. */
const Thread: React.FC<{sc: Score; frame: number; total: number; dark: boolean}> = ({sc, frame, total, dark}) => {
  const g = (sc.scene.start ?? 0) + frame;
  const x = 84 + 1752 * clamp01(g / Math.max(1, total));
  const color = dark ? P.paper : P.ink;
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: 0.6}}>
      <Stroke pts={segment([84, 1046], [x, 1046], 18)} seed="thread" tick={boilTick(sc, frame)} width={2.5} color={color} amp={1.2} />
      <circle cx={x} cy={1046} r={5} fill={P.signal} />
    </svg>
  );
};

/**
 * How a sheet enters. The dot motif doubles as the wipe on the two structural hinges
 * (decision, result): a signal disk that fills the frame and contracts to nothing. Other
 * sheets come in like a misfed print, a few pixels off, snapping into register.
 */
const Entry: React.FC<{kind: Scene['kind']; frame: number}> = ({kind, frame}) => {
  if (kind !== 'decision' && kind !== 'result') return null;
  const r = interpolate(frame, [0, 9], [1250, 0], {extrapolateRight: 'clamp'});
  if (r <= 0) return null;
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
      <circle cx={960} cy={540} r={r} fill={P.signal} />
    </svg>
  );
};

const Sheet: React.FC<{spec: Spec; scene: Scene; acc: Float64Array | null; total: number}> = ({spec, scene, acc, total}) => {
  const frame = useCurrentFrame();
  const sc: Score = {scene, map: spec.audioMap ?? null, acc};
  const Body = BODY[scene.kind] ?? BeatScene;
  const dark = scene.kind === 'result';
  const misfeed = scene.kind === 'decision' || scene.kind === 'result' ? 0 : [34, 12, 0][Math.min(2, frame)];
  const n = spec.scenes.length;
  const label = `${String((scene.index ?? 0) + 1).padStart(2, '0')}/${String(n).padStart(2, '0')}  ${scene.kind}  ${spec.title}`;
  return (
    <AbsoluteFill>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      {scene.sfx ? <Audio src={staticFile(scene.sfx)} volume={0.5} /> : null}
      <PaperGround dark={dark} seed={3 + (scene.index ?? 0)} />
      <AbsoluteFill style={{transform: `translateX(${misfeed}px)`, overflow: 'hidden'}}>
        <Body sc={sc} frame={frame} spec={spec} />
      </AbsoluteFill>
      <SheetMarks label={label} color={dark ? P.paper : P.ink} />
      <Thread sc={sc} frame={frame} total={total} dark={dark} />
      <Entry kind={scene.kind} frame={frame} />
    </AbsoluteFill>
  );
};

export const PaperRuche: React.FC<{spec: Spec}> = ({spec}) => {
  const {durationInFrames} = useVideoConfig();
  const acc = useMemo(() => buildAcc(spec.audioMap), [spec.audioMap]);
  const scenes = useMemo(() => {
    let start = 0;
    return spec.scenes.map((s, i) => {
      const out = {...s, start: s.start ?? start, index: s.index ?? i};
      start += Math.max(1, s.frames);
      return out;
    });
  }, [spec.scenes]);
  const vol = spec.musicVolume ?? 0.12;
  return (
    <AbsoluteFill style={{backgroundColor: P.paper}}>
      {spec.bgm ? (
        <Audio
          loop
          src={staticFile(spec.bgm)}
          volume={(f) =>
            interpolate(f, [0, 45, durationInFrames - 60, durationInFrames], [0, vol, vol, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}
      <Series>
        {scenes.map((sc, i) => (
          <Series.Sequence key={i} durationInFrames={Math.max(1, sc.frames)}>
            <Sheet spec={spec} scene={sc} acc={acc} total={durationInFrames} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
