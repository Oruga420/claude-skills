import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import {Arrow, BigTitle, Caption, Pulse, theme, useFadeIn, Pt} from '../ui';

const LaneTitle: React.FC<{y: number; num: string; name: string; note: string; start: number; color: string}> = ({
  y,
  num,
  name,
  note,
  start,
  color,
}) => {
  const fade = useFadeIn(start);
  return (
    <div style={{position: 'absolute', left: 70, top: y, width: 560, fontFamily: theme.font, ...fade}}>
      <div style={{fontSize: 30, fontWeight: 700, color}}>
        {num} {name}
      </div>
      <div style={{fontSize: 20, color: theme.dim, marginTop: 4}}>{note}</div>
    </div>
  );
};

const Tick: React.FC<{x: number; y: number; label: string; start: number; color?: string}> = ({
  x,
  y,
  label,
  start,
  color = theme.blue,
}) => {
  const fade = useFadeIn(start, 10);
  return (
    <div style={{position: 'absolute', left: x - 40, top: y - 12, width: 80, textAlign: 'center', fontFamily: theme.font, ...fade}}>
      <div style={{width: 22, height: 22, borderRadius: 11, background: color, margin: '0 auto'}} />
      <div style={{fontSize: 18, color: theme.dim, marginTop: 6}}>{label}</div>
    </div>
  );
};

const WakeFlash: React.FC<{x: number; y: number; at: number; label?: string; color?: string; icon?: string}> = ({
  x,
  y,
  at,
  label = 'agent run',
  color = theme.green,
  icon = '🤖',
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [at, at + 8, at + 55, at + 70], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 70,
        top: y,
        width: 140,
        textAlign: 'center',
        fontFamily: theme.font,
        opacity,
      }}
    >
      <div style={{fontSize: 30}}>{icon}</div>
      <div style={{fontSize: 17, color}}>{label}</div>
    </div>
  );
};

// Recreation of the video's four trigger types diagram, animated.
export const TriggerTypes: React.FC = () => {
  const frame = useCurrentFrame();

  // Lane 1: circular for-loop
  const circleCenter: Pt = [1250, 190];
  const r = 62;
  const circlePts: Pt[] = Array.from({length: 25}, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    return [circleCenter[0] + r * Math.cos(a), circleCenter[1] + r * Math.sin(a)];
  });
  const goalDone = frame > 500;

  // Lane 2 + 4 cron ticks
  const cronXs = [740, 950, 1160, 1370, 1580];
  const hours = ['7am', '8am', '9am', '10am', '11am'];

  // Lane 3 events
  const events = [
    {x: 860, at: 120, icon: '✉️', label: 'new email'},
    {x: 1120, at: 230, icon: '✉️', label: 'new email'},
    {x: 1480, at: 340, icon: '🔴', label: 'incident'},
  ];

  // Lane 4: which cron ticks actually have work
  const hasWork = [false, true, false, true, false];

  return (
    <AbsoluteFill style={{background: theme.bg}}>
      <BigTitle text="THE 4 TRIGGER TYPES" sub="choosing the right trigger drives the cost down" />

      {/* ---- Lane 1: continuous for-loop ---- */}
      <LaneTitle
        y={150}
        num="#1"
        name="Continuous for-loop"
        note="while (goal !== satisfied && turns < max) → /goal · immediate feedback"
        start={0}
        color={theme.blue}
      />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <path
          d={`M ${circlePts.map((p) => p.join(' ')).join(' L ')} Z`}
          stroke={theme.stroke}
          strokeWidth={3}
          fill="none"
          opacity={interpolate(frame, [10, 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
        />
        {!goalDone && <Pulse points={[...circlePts, circlePts[0]]} color={theme.blue} start={30} dur={75} />}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: circleCenter[0] - 55,
          top: circleCenter[1] - 16,
          fontFamily: theme.font,
          fontSize: 22,
          color: goalDone ? theme.green : theme.dim,
        }}
      >
        {goalDone ? 'goal ✓' : 'work()'}
      </div>

      {/* ---- Lane 2: cron ---- */}
      <LaneTitle y={370} num="#2" name="Time-based cron" note="/loop (same session) · /schedule (cloud) — wakes on a fixed interval" start={60} color={theme.orange} />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <Arrow points={[[700, 420], [1720, 420]]} color={theme.stroke} start={70} drawDur={25} />
      </svg>
      {cronXs.map((x, i) => (
        <Tick key={i} x={x} y={420} label={hours[i]} start={90 + i * 12} color={theme.orange} />
      ))}
      {cronXs.map((x, i) => (
        <WakeFlash key={i} x={x} y={455} at={130 + i * 85} />
      ))}

      {/* ---- Lane 3: event-based ---- */}
      <LaneTitle y={590} num="#3" name="Event-based" note="reactive: webhook → local daemon URL → wake the agent now" start={100} color={theme.red} />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <Arrow points={[[700, 640], [1720, 640]]} color={theme.stroke} start={110} drawDur={25} />
      </svg>
      {events.map((e, i) => {
        const fade = {
          opacity: interpolate(frame, [e.at, e.at + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        };
        return (
          <div
            key={i}
            style={{position: 'absolute', left: e.x - 60, top: 595, width: 120, textAlign: 'center', fontFamily: theme.font, ...fade}}
          >
            <div style={{fontSize: 28}}>{e.icon}</div>
            <div style={{fontSize: 16, color: theme.dim}}>{e.label}</div>
          </div>
        );
      })}
      {events.map((e, i) => (
        <WakeFlash key={i} x={e.x} y={668} at={e.at + 15} label="wake now" color={theme.red} />
      ))}

      {/* ---- Lane 4: combo / workflow ---- */}
      <LaneTitle
        y={800}
        num="#4"
        name="Combo / workflow"
        note="cron ticks → cheap gate script checks for real work → wake only then"
        start={140}
        color={theme.green}
      />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <Arrow points={[[700, 840], [1720, 840]]} color={theme.stroke} start={150} drawDur={25} />
        <Arrow points={[[700, 1005], [1720, 1005]]} color={theme.stroke} start={150} drawDur={25} />
        {cronXs.map((x, i) => (
          <React.Fragment key={i}>
            <Pulse
              points={[[x, 852], [x, 915]]}
              color={theme.blue}
              start={200 + i * 70}
              dur={25}
              repeat={false}
              size={7}
              end={200 + i * 70 + 25}
            />
            {hasWork[i] && (
              <Pulse
                points={[[x, 945], [x, 1005]]}
                color={theme.green}
                start={232 + i * 70}
                dur={22}
                repeat={false}
                size={8}
                end={232 + i * 70 + 22}
              />
            )}
          </React.Fragment>
        ))}
      </svg>
      {cronXs.map((x, i) => (
        <Tick key={i} x={x} y={840} label={hours[i]} start={160 + i * 10} color={theme.blue} />
      ))}
      {/* gate script bar */}
      <div
        style={{
          position: 'absolute',
          left: 700,
          top: 915,
          width: 1020,
          height: 34,
          border: `2px dashed ${theme.green}`,
          borderRadius: 10,
          background: '#0f1f14',
          fontFamily: theme.font,
          fontSize: 19,
          color: theme.green,
          textAlign: 'center',
          lineHeight: '30px',
          ...{opacity: interpolate(frame, [180, 200], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})},
        }}
      >
        gate script: fetch data source → any new work? (skip = tokens saved)
      </div>
      {cronXs.map((x, i) =>
        hasWork[i] ? (
          <WakeFlash key={i} x={x} y={1012} at={255 + i * 70} label="real work → run" />
        ) : (
          <WakeFlash key={i} x={x} y={952} at={226 + i * 70} label="skip" color={theme.dim} icon="💤" />
        ),
      )}

      <Caption
        text="#1 and #2 are built into Claude Code / Codex · #3 and #4 need a small local daemon"
        start={420}
        y={1040}
      />
    </AbsoluteFill>
  );
};
