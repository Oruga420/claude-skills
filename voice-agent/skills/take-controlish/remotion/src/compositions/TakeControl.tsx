import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Series,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Spec} from '../types';
import {
  Backdrop,
  Overflow,
  Panel,
  Pill,
  SceneTitle,
  accentFor,
  clampList,
  theme,
  useIn,
  useSceneFade,
  verdictColor,
} from '../ui';

/** Shrink a headline so long titles still fit on one screen. */
const fitTitle = (text: string) =>
  text.length > 92 ? 46 : text.length > 62 ? 56 : text.length > 38 ? 68 : 82;

const fitBody = (text: string) => (text.length > 420 ? 26 : text.length > 240 ? 30 : 34);

// ------------------------------------------------------------------ scenes

const TitleScene: React.FC<{spec: Spec; accent: string}> = ({spec, accent}) => {
  const badge = useIn(0, 14);
  const title = useIn(10, 18);
  const sub = useIn(22, 16);
  const meta = useIn(32, 16);
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 160px',
        textAlign: 'center',
      }}
    >
      <div style={badge}>
        <Pill
          text={spec.mode === 'full' ? 'TAKE CONTROL - FULL' : 'TAKE CONTROL'}
          color={accent}
          size={24}
        />
      </div>
      <div
        style={{
          ...title,
          fontSize: fitTitle(spec.title),
          fontWeight: 700,
          letterSpacing: -1.5,
          lineHeight: 1.12,
          marginTop: 34,
          maxWidth: 1500,
        }}
      >
        {spec.title}
      </div>
      {spec.subtitle ? (
        <div
          style={{
            ...sub,
            fontSize: 30,
            color: theme.dim,
            marginTop: 26,
            maxWidth: 1250,
            lineHeight: 1.45,
          }}
        >
          {spec.subtitle}
        </div>
      ) : null}
      <div style={{...meta, marginTop: 44, display: 'flex', gap: 18, alignItems: 'center'}}>
        <div style={{width: 60, height: 3, background: accent, borderRadius: 2}} />
        <div style={{fontFamily: theme.mono, fontSize: 22, color: theme.faint, letterSpacing: 2}}>
          {spec.date}
        </div>
        <div style={{width: 60, height: 3, background: accent, borderRadius: 2}} />
      </div>
    </AbsoluteFill>
  );
};

const NotScopeItem: React.FC<{text: string; start: number}> = ({text, start}) => {
  const a = useIn(start);
  return (
    <div
      style={{
        ...a,
        fontSize: 21,
        color: theme.dim,
        lineHeight: 1.4,
        marginBottom: 12,
        paddingLeft: 18,
        borderLeft: `2px solid ${theme.red}66`,
      }}
    >
      {text}
    </div>
  );
};

const ObjectiveScene: React.FC<{spec: Spec; accent: string}> = ({spec, accent}) => {
  const body = useIn(16, 16);
  const {shown, rest} = clampList(spec.notScope, 4);
  const wide = spec.notScope.length === 0;
  return (
    <AbsoluteFill>
      <SceneTitle kicker="el objetivo" title="Que se va a resolver" accent={accent} />
      <div
        style={{
          ...body,
          position: 'absolute',
          left: 110,
          top: 320,
          width: wide ? 1700 : 1180,
          fontSize: fitBody(spec.objective),
          lineHeight: 1.55,
          color: theme.text,
        }}
      >
        {spec.objective}
      </div>
      {spec.notScope.length ? (
        <Panel start={34} style={{position: 'absolute', left: 1360, top: 300, width: 450}}>
          <div
            style={{
              fontFamily: theme.mono,
              fontSize: 19,
              letterSpacing: 3,
              color: theme.red,
              marginBottom: 16,
            }}
          >
            FUERA DE ALCANCE
          </div>
          {shown.map((n, i) => (
            <NotScopeItem key={i} text={n} start={42 + i * 8} />
          ))}
          <Overflow rest={rest} start={80} />
        </Panel>
      ) : null}
    </AbsoluteFill>
  );
};

const PhaseRow: React.FC<{
  n: number;
  name: string;
  detail: string;
  start: number;
  accent: string;
}> = ({n, name, detail, start, accent}) => {
  const a = useIn(start);
  return (
    <div
      style={{
        ...a,
        display: 'flex',
        gap: 26,
        alignItems: 'flex-start',
        marginBottom: 22,
        borderBottom: `1px solid ${theme.stroke}66`,
        paddingBottom: 18,
      }}
    >
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: 26,
          fontWeight: 700,
          color: accent,
          border: `2px solid ${accent}`,
          borderRadius: 10,
          width: 54,
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div style={{flex: 1}}>
        <div style={{fontSize: 31, fontWeight: 600, marginBottom: 6}}>{name}</div>
        <div style={{fontSize: 22, color: theme.dim, lineHeight: 1.45}}>{detail}</div>
      </div>
    </div>
  );
};

const PhasesScene: React.FC<{spec: Spec; accent: string}> = ({spec, accent}) => {
  const {shown, rest} = clampList(spec.phases, 6);
  return (
    <AbsoluteFill>
      <SceneTitle kicker="el plan" title="Las fases" accent={accent} />
      <div style={{position: 'absolute', left: 110, top: 306, right: 110}}>
        {shown.map((p, i) => (
          <PhaseRow
            key={i}
            n={p.n}
            name={p.name}
            detail={p.detail}
            start={14 + i * 10}
            accent={accent}
          />
        ))}
        <Overflow rest={rest} start={90} word="fases" />
      </div>
    </AbsoluteFill>
  );
};

const ScoreGauge: React.FC<{score: number}> = ({score}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: frame - 12, fps, config: {damping: 200}});
  const value = (score / 10) * p;
  const R = 128;
  const C = 2 * Math.PI * R;
  const color = score >= 9 ? theme.green : score >= 7 ? theme.amber : theme.red;
  return (
    <div style={{position: 'relative', width: 320, height: 320}}>
      <svg width={320} height={320} style={{transform: 'rotate(-90deg)'}}>
        <circle cx={160} cy={160} r={R} fill="none" stroke={theme.stroke} strokeWidth={16} />
        <circle
          cx={160}
          cy={160}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - value)}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{fontFamily: theme.mono, fontSize: 84, fontWeight: 700, color}}>
          {(score * p).toFixed(1)}
        </div>
        <div style={{fontFamily: theme.mono, fontSize: 22, color: theme.faint, letterSpacing: 3}}>
          DE 10
        </div>
      </div>
    </div>
  );
};

const ClaimRow: React.FC<{claim: string; verdict: string; start: number}> = ({
  claim,
  verdict,
  start,
}) => {
  const a = useIn(start);
  return (
    <div style={{...a, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 15}}>
      <div style={{width: 168, flexShrink: 0, textAlign: 'right'}}>
        <Pill text={verdict} color={verdictColor(verdict)} size={17} />
      </div>
      <div style={{fontSize: 23, color: theme.text, lineHeight: 1.35}}>{claim}</div>
    </div>
  );
};

const JudgeScene: React.FC<{spec: Spec; accent: string}> = ({spec, accent}) => {
  const j = spec.judge;
  const gauge = useIn(10);
  const claims = clampList(j.claims, 5);
  const changes = clampList(j.changes, 3);
  return (
    <AbsoluteFill>
      <SceneTitle kicker="el fusilamiento" title="judge-charly" accent={accent} />
      <div style={{position: 'absolute', left: 130, top: 330, ...gauge}}>
        <ScoreGauge score={j.score} />
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: 21,
            color: theme.dim,
            textAlign: 'center',
            marginTop: 18,
            letterSpacing: 1,
          }}
        >
          {j.rounds} {j.rounds === 1 ? 'ronda' : 'rondas'} de revision
        </div>
      </div>
      <div style={{position: 'absolute', left: 560, top: 316, right: 110}}>
        {claims.shown.map((c, i) => (
          <ClaimRow key={i} claim={c.claim} verdict={c.verdict} start={18 + i * 9} />
        ))}
        <Overflow rest={claims.rest} start={80} word="claims" />
        {j.changes.length ? (
          <Panel start={72} style={{marginTop: 26}}>
            <div
              style={{
                fontFamily: theme.mono,
                fontSize: 18,
                letterSpacing: 3,
                color: accent,
                marginBottom: 12,
              }}
            >
              QUE CAMBIO EL PLAN POR ESTO
            </div>
            {changes.shown.map((c, i) => (
              <div
                key={i}
                style={{fontSize: 21, color: theme.dim, lineHeight: 1.45, marginBottom: 8}}
              >
                - {c}
              </div>
            ))}
            <Overflow rest={changes.rest} start={100} word="cambios" />
          </Panel>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const CriterionRow: React.FC<{check: string; green: string; start: number}> = ({
  check,
  green,
  start,
}) => {
  const a = useIn(start);
  return (
    <div
      style={{
        ...a,
        display: 'flex',
        gap: 22,
        alignItems: 'flex-start',
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: `1px solid ${theme.stroke}55`,
      }}
    >
      <div style={{color: theme.green, fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 4}}>
        OK
      </div>
      <div style={{flex: 1}}>
        <div style={{fontFamily: theme.mono, fontSize: 22, color: theme.text, marginBottom: 6}}>
          {check}
        </div>
        <div style={{fontSize: 21, color: theme.dim, lineHeight: 1.4}}>verde si: {green}</div>
      </div>
    </div>
  );
};

const ContractScene: React.FC<{spec: Spec; accent: string}> = ({spec, accent}) => {
  const {shown, rest} = clampList(spec.contract.acceptance, 5);
  const head = useIn(12);
  const label = useIn(18);
  return (
    <AbsoluteFill>
      <SceneTitle
        kicker="el contrato"
        title={spec.contract.name || 'Contrato del loop'}
        accent={accent}
      />
      <div
        style={{
          ...head,
          position: 'absolute',
          left: 110,
          top: 292,
          fontFamily: theme.mono,
          fontSize: 21,
          color: theme.faint,
        }}
      >
        {spec.contract.path}
      </div>
      <div style={{position: 'absolute', left: 110, top: 352, right: 110}}>
        <div
          style={{
            ...label,
            fontFamily: theme.mono,
            fontSize: 18,
            letterSpacing: 3,
            color: accent,
            marginBottom: 20,
          }}
        >
          CRITERIOS DE ACEPTACION - FALSABLES
        </div>
        {shown.map((a, i) => (
          <CriterionRow key={i} check={a.check} green={a.green} start={24 + i * 10} />
        ))}
        <Overflow rest={rest} start={90} word="criterios" />
      </div>
    </AbsoluteFill>
  );
};

const StatusScene: React.FC<{spec: Spec; accent: string}> = ({spec, accent}) => {
  const head = useIn(10, 16);
  const detail = useIn(22, 16);
  const files = useIn(56);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: '0 130px'}}>
      <div style={head}>
        <Pill
          text={spec.mode === 'full' ? 'CONSTRUIDO' : 'ESPERANDO TU VISTO BUENO'}
          color={accent}
          size={22}
        />
        <div
          style={{
            fontSize: fitTitle(spec.status.headline),
            fontWeight: 700,
            marginTop: 28,
            lineHeight: 1.15,
          }}
        >
          {spec.status.headline}
        </div>
      </div>
      <div
        style={{
          ...detail,
          fontSize: 28,
          color: theme.dim,
          marginTop: 24,
          maxWidth: 1350,
          lineHeight: 1.5,
        }}
      >
        {spec.status.detail}
      </div>
      <Panel start={38} style={{marginTop: 40, maxWidth: 1400, borderColor: accent}}>
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: 18,
            letterSpacing: 3,
            color: accent,
            marginBottom: 12,
          }}
        >
          LO QUE SIGUE
        </div>
        <div style={{fontSize: 26, lineHeight: 1.45}}>{spec.status.next}</div>
      </Panel>
      <div style={{...files, marginTop: 34, display: 'flex', gap: 44, flexWrap: 'wrap'}}>
        {spec.artifacts.map((a, i) => (
          <div key={i}>
            <div style={{fontSize: 20, color: theme.faint, marginBottom: 4}}>{a.label}</div>
            <div style={{fontFamily: theme.mono, fontSize: 19, color: theme.dim}}>{a.path}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Product mocks. Each screen gets an equal slice of the scene: it slides in, holds, and the
 * next one takes over. A caption band under the image says what the viewer is looking at.
 * With one screen the image is centered; with several the previous one stays dimmed behind.
 */
const ScreensScene: React.FC<{spec: Spec; accent: string}> = ({spec, accent}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const shots = spec.screens ?? [];
  if (!shots.length) {
    return (
      <AbsoluteFill>
        <SceneTitle kicker="las pantallas" title="Como se veria" accent={accent} />
      </AbsoluteFill>
    );
  }
  const slice = Math.max(1, Math.floor((durationInFrames - 30) / shots.length));
  const idx = Math.min(shots.length - 1, Math.floor(Math.max(0, frame - 30) / slice));
  const local = Math.max(0, frame - 30 - idx * slice);
  const o = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const opacity = interpolate(local, [0, 12], [0, 1], o);
  const slide = interpolate(local, [0, 16], [60, 0], o);
  const shot = shots[idx];
  return (
    <AbsoluteFill>
      <SceneTitle kicker="las pantallas" title="Como se veria" accent={accent} />
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 262,
          width: 1700,
          height: 700,
          borderRadius: 18,
          border: `1.5px solid ${theme.stroke}`,
          background: theme.panel,
          overflow: 'hidden',
          opacity,
          transform: `translateX(${slide}px)`,
          boxShadow: `0 30px 80px -30px ${accent}55`,
        }}
      >
        <div
          style={{
            height: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 18px',
            borderBottom: `1px solid ${theme.stroke}`,
            background: theme.bg1,
          }}
        >
          {[theme.red, theme.amber, theme.green].map((c, i) => (
            <div key={i} style={{width: 12, height: 12, borderRadius: 6, background: c}} />
          ))}
          <div
            style={{
              marginLeft: 16,
              fontFamily: theme.mono,
              fontSize: 17,
              color: theme.faint,
              letterSpacing: 1,
            }}
          >
            {shot.label}
          </div>
          <div
            style={{
              marginLeft: 'auto',
              fontFamily: theme.mono,
              fontSize: 16,
              color: accent,
              letterSpacing: 2,
            }}
          >
            {idx + 1} / {shots.length}
          </div>
        </div>
        <Img
          src={staticFile(shot.file)}
          style={{width: '100%', height: 656, objectFit: 'cover', objectPosition: 'top', display: 'block'}}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 986,
          width: 1700,
          fontSize: 24,
          color: theme.dim,
          lineHeight: 1.4,
          opacity,
        }}
      >
        {shot.caption}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ shell

const BODIES: Record<string, React.FC<{spec: Spec; accent: string}>> = {
  title: TitleScene,
  objective: ObjectiveScene,
  phases: PhasesScene,
  judge: JudgeScene,
  contract: ContractScene,
  screens: ScreensScene,
  status: StatusScene,
};

const SceneShell: React.FC<{
  spec: Spec;
  kind: string;
  audio: string | null;
  accent: string;
}> = ({spec, kind, audio, accent}) => {
  const opacity = useSceneFade();
  const Body = BODIES[kind] ?? TitleScene;
  return (
    <AbsoluteFill>
      {audio ? <Audio src={staticFile(audio)} /> : null}
      <AbsoluteFill style={{opacity}}>
        <Backdrop accent={accent}>
          <Body spec={spec} accent={accent} />
        </Backdrop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const TakeControl: React.FC<{spec: Spec}> = ({spec}) => {
  const accent = accentFor(spec.mode);
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: theme.bg0}}>
      {spec.bgm ? (
        <Audio
          loop
          src={staticFile(spec.bgm)}
          volume={(f) =>
            interpolate(
              f,
              [0, 45, durationInFrames - 60, durationInFrames],
              [0, 0.13, 0.13, 0],
              {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
            )
          }
        />
      ) : null}
      <Series>
        {spec.scenes.map((sc, i) => (
          <Series.Sequence key={i} durationInFrames={Math.max(1, sc.frames)}>
            <SceneShell spec={spec} kind={sc.kind} audio={sc.audio} accent={accent} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
