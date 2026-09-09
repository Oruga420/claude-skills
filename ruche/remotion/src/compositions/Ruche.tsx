import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Scene, Spec} from '../types';
import {theme, useIn, useSceneFade} from '../ui';

const KIND_LABEL: Record<string, string> = {
  title: '',
  context: 'CONTEXTO',
  beat: 'QUE PASO',
  decision: 'DECISION',
  result: 'RESULTADO',
  outro: 'SIGUIENTE',
};

const KIND_COLOR: Record<string, string> = {
  title: theme.cyan,
  context: theme.blue,
  beat: theme.cyan,
  decision: theme.amber,
  result: theme.green,
  outro: theme.purple,
};

/** Full-bleed image with a slow Ken Burns push, or a gradient backdrop when there is none. */
const Plate: React.FC<{image: string | null}> = ({image}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.04, 1.14], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{background: theme.bg0, overflow: 'hidden'}}>
      {image ? (
        <Img
          src={staticFile(image)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: `radial-gradient(120% 90% at 12% 0%, ${theme.bg1} 0%, ${theme.bg0} 62%)`,
          }}
        />
      )}
      {/* Dark overlay so text stays readable on any plate (80%+ at the text zone). */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(7,10,15,0.35) 0%, rgba(7,10,15,0.55) 45%, rgba(7,10,15,0.88) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{text: string; color: string}> = ({text, color}) => {
  const s = useIn(4, 12, 10);
  if (!text) return null;
  return (
    <div
      style={{
        ...s,
        fontFamily: theme.mono,
        fontSize: 26,
        letterSpacing: 6,
        color,
        marginBottom: 18,
      }}
    >
      {text}
    </div>
  );
};

const Heading: React.FC<{text: string; size?: number}> = ({text, size = 72}) => {
  const s = useIn(8, 16, 26);
  return (
    <div
      style={{
        ...s,
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.08,
        letterSpacing: -1,
        color: theme.text,
        textShadow: '0 4px 24px rgba(0,0,0,0.6)',
        maxWidth: 1500,
      }}
    >
      {text}
    </div>
  );
};

const Bullets: React.FC<{items: string[]; color: string}> = ({items, color}) => (
  <div style={{display: 'flex', flexDirection: 'column', gap: 18, marginTop: 34}}>
    {items.slice(0, 5).map((b, i) => (
      <Bullet key={i} text={b} color={color} start={22 + i * 9} />
    ))}
  </div>
);

const Bullet: React.FC<{text: string; color: string; start: number}> = ({text, color, start}) => {
  const s = useIn(start, 14, 18);
  return (
    <div style={{...s, display: 'flex', alignItems: 'flex-start', gap: 20}}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          background: color,
          marginTop: 16,
          flexShrink: 0,
          boxShadow: `0 0 18px ${color}`,
        }}
      />
      <div
        style={{
          fontSize: 36,
          lineHeight: 1.3,
          color: theme.text,
          textShadow: '0 2px 14px rgba(0,0,0,0.7)',
          maxWidth: 1400,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const TitleBody: React.FC<{spec: Spec; scene: Scene}> = ({spec, scene}) => {
  const sub = useIn(26, 16, 16);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
      <Heading text={scene.heading || spec.title} size={104} />
      <div style={{...sub, fontSize: 40, color: theme.dim, marginTop: 26}}>{spec.subtitle}</div>
      <div
        style={{
          ...sub,
          position: 'absolute',
          bottom: 70,
          fontFamily: theme.mono,
          fontSize: 24,
          color: theme.faint,
          letterSpacing: 3,
        }}
      >
        {spec.date}
      </div>
    </AbsoluteFill>
  );
};

const CardBody: React.FC<{scene: Scene}> = ({scene}) => {
  const color = KIND_COLOR[scene.kind] ?? theme.cyan;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', padding: '0 120px 110px'}}>
      <Kicker text={KIND_LABEL[scene.kind] ?? ''} color={color} />
      <Heading text={scene.heading} />
      <Bullets items={scene.bullets} color={color} />
    </AbsoluteFill>
  );
};

const SceneShell: React.FC<{spec: Spec; scene: Scene}> = ({spec, scene}) => {
  const opacity = useSceneFade(12);
  return (
    <AbsoluteFill>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      {scene.sfx ? <Audio src={staticFile(scene.sfx)} volume={0.5} /> : null}
      <AbsoluteFill style={{opacity, fontFamily: theme.sans}}>
        <Plate image={scene.image} />
        {scene.kind === 'title' ? <TitleBody spec={spec} scene={scene} /> : <CardBody scene={scene} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Ruche: React.FC<{spec: Spec}> = ({spec}) => {
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: theme.bg0}}>
      {spec.bgm ? (
        <Audio
          loop
          src={staticFile(spec.bgm)}
          volume={(f) =>
            interpolate(f, [0, 45, durationInFrames - 60, durationInFrames], [0, 0.12, 0.12, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}
      <Series>
        {spec.scenes.map((sc, i) => (
          <Series.Sequence key={i} durationInFrames={Math.max(1, sc.frames)}>
            <SceneShell spec={spec} scene={sc} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
