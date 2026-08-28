import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import {Arrow, BigTitle, Box, Caption, Line, Pulse, theme, Pt} from '../ui';

// Recreation of the video's "Doc maintainer loop" example flow.
export const DocMaintainer: React.FC = () => {
  const frame = useCurrentFrame();

  const cronToGate: Pt[] = [
    [420, 205],
    [520, 205],
  ];
  const gateNo: Pt[] = [
    [950, 205],
    [1120, 205],
  ];
  const gateYes: Pt[] = [
    [730, 250],
    [730, 300],
    [310, 300],
    [310, 360],
  ];
  const s1s2: Pt[] = [
    [500, 445],
    [560, 445],
  ];
  const s2s3: Pt[] = [
    [940, 445],
    [1000, 445],
  ];
  const drift: Pt[] = [
    [1190, 530],
    [1190, 575],
    [980, 575],
    [980, 630],
  ];
  const accurate: Pt[] = [
    [1330, 530],
    [1330, 575],
    [1470, 575],
    [1470, 630],
  ];
  const backHome: Pt[] = [
    [980, 830],
    [980, 950],
    [90, 950],
    [90, 205],
    [120, 205],
  ];

  const noOpacity = interpolate(frame, [150, 165], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{background: theme.bg}}>
      <BigTitle text="DOC MAINTAINER LOOP" sub="a small but mighty starter loop — keep docs matching what the code ships" />

      <Box x={120} y={160} w={300} h={90} title="⏰ CRON · MON 6AM" color={theme.orange} start={0} titleSize={24} />
      <Box x={520} y={160} w={430} h={90} title="cheap gate script" color={theme.green} start={30} dashed titleSize={22}>
        <Line text="any new commits / PRs?" size={19} />
      </Box>
      <div
        style={{
          position: 'absolute',
          left: 1130,
          top: 180,
          fontFamily: theme.font,
          fontSize: 22,
          color: theme.dim,
          opacity: noOpacity,
        }}
      >
        no → 💤 silent skip
      </div>

      <Box x={120} y={360} w={380} h={170} title="01 READ THE DIFF" color={theme.text} start={90} titleSize={24}>
        <Line text="commits + PRs since the last sweep" />
        <Line text="cursor lives in state, no re-reads" color={theme.dim} size={18} />
      </Box>
      <Box x={560} y={360} w={380} h={170} title="02 COMPARE" color={theme.text} start={150} titleSize={24}>
        <Line text="README · setup guides · examples · runbooks" />
        <Line text="vs what the code ships NOW" color={theme.dim} size={18} />
      </Box>
      <Box x={1000} y={360} w={400} h={170} title="03 VERIFY FOR REAL" color={theme.orange} start={210} titleSize={24}>
        <Line text="run the commands · check the links · try the examples" />
        <Line text="never trust memory" color={theme.red} size={19} />
      </Box>

      <Box x={740} y={630} w={480} h={200} title="04 FIX + OPEN PR" color={theme.orange} start={300} titleSize={24}>
        <Line text="smallest fix · fresh worktree" />
        <Line text="PR explains the drift" />
        <Line text="guardrail: never stack a 2nd open PR" color={theme.red} size={19} />
      </Box>
      <Box x={1290} y={630} w={400} h={170} title="✓ CLEAN STOP" color={theme.green} start={330} titleSize={24}>
        <Line text="nothing stale found" />
        <Line text="zero drift = a successful run, not a wasted one" color={theme.green} size={18} />
      </Box>

      <Box x={130} y={640} w={420} h={130} title="🤖 ONE agent, start to finish" color={theme.dim} start={360} dashed titleSize={22}>
        <Line text="no handoffs, no extra layers:" size={18} />
        <Line text="the whole task fits in one head" size={18} />
      </Box>

      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <Arrow points={cronToGate} color={theme.orange} start={40} />
        <Pulse points={cronToGate} color={theme.orange} start={55} dur={35} />

        <Arrow points={gateNo} color={theme.dim} start={150} dashed />

        <Arrow points={gateYes} color={theme.green} start={95} />
        <Pulse points={gateYes} color={theme.green} start={110} dur={55} />

        <Arrow points={s1s2} color={theme.stroke} start={160} />
        <Arrow points={s2s3} color={theme.stroke} start={220} />
        <Pulse points={[...s1s2]} color={theme.blue} start={175} dur={30} size={7} />
        <Pulse points={[...s2s3]} color={theme.blue} start={235} dur={30} size={7} />

        <Arrow points={drift} color={theme.orange} start={310} />
        <Pulse points={drift} color={theme.orange} start={325} dur={45} size={7} />
        <Arrow points={accurate} color={theme.green} start={340} />
        <Pulse points={accurate} color={theme.green} start={355} dur={45} size={7} />

        <Arrow points={backHome} color={theme.green} start={430} dashed drawDur={40} />
        <Pulse points={backHome} color={theme.green} start={470} dur={110} />
      </svg>

      <div
        style={{
          position: 'absolute',
          left: 1160,
          top: 548,
          fontFamily: theme.font,
          fontSize: 20,
          color: theme.orange,
          opacity: interpolate(frame, [315, 330], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        found drift
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1490,
          top: 548,
          fontFamily: theme.font,
          fontSize: 20,
          color: theme.green,
          opacity: interpolate(frame, [345, 360], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        all accurate
      </div>

      <Caption
        text="↻ both paths: write the run to state + logs · sleep until next Monday"
        start={440}
        y={1000}
        color={theme.green}
      />
    </AbsoluteFill>
  );
};
