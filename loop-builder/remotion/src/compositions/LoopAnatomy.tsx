import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import {Arrow, BigTitle, Box, Caption, Line, Pulse, theme, Pt} from '../ui';

// Recreation of the video's "anatomy of a good loop" diagram:
// {loop}/README.md (contract + state/log) -> TRIGGER -> ORCHESTRATOR -> EXECUTORS <-> VERIFIERS -> back to README
export const LoopAnatomy: React.FC = () => {
  const frame = useCurrentFrame();

  const readmeToTrigger: Pt[] = [
    [310, 280],
    [310, 210],
    [760, 210],
  ];
  const triggerToOrch: Pt[] = [
    [1040, 420],
    [1040, 500],
    [1260, 500],
    [1260, 545],
  ];
  const orchToExec = (cx: number): Pt[] => [
    [1260, 655],
    [1260, 685],
    [cx, 685],
    [cx, 715],
  ];
  const execDown = (cx: number): Pt[] => [
    [cx - 14, 805],
    [cx - 14, 858],
  ];
  const verUp = (cx: number): Pt[] => [
    [cx + 14, 858],
    [cx + 14, 805],
  ];
  const backToReadme: Pt[] = [
    [700, 905],
    [310, 905],
    [310, 805],
  ];

  const execCenters = [900, 1260, 1620];

  const captionIdx = interpolate(frame, [0, 120, 240, 360, 480, 600], [0, 1, 2, 3, 4, 5], {
    extrapolateRight: 'clamp',
  });
  const captions = [
    'One README.md holds the whole loop: contract + state + logs',
    'The trigger layer reads the contract and decides when to wake the agent',
    'The orchestrator gathers signals, finds the work, prioritizes and dispatches',
    'Executors run in parallel — each in an isolated git worktree',
    'Every executor hands off to a verifier: tests + evidence attached to the PR',
    'All updates flow back into the README — the next run starts smarter',
  ];
  const caption = captions[Math.min(5, Math.floor(captionIdx))];

  return (
    <AbsoluteFill style={{background: theme.bg}}>
      <BigTitle text="ANATOMY OF A GOOD LOOP" sub="loop contract · trigger · agents · state that compounds" />

      {/* README / contract */}
      <Box x={100} y={280} w={420} h={525} title="loops/{name}/README.md" color={theme.text} start={0} titleSize={24}>
        <div
          style={{
            border: `2px solid ${theme.yellow}`,
            borderRadius: 10,
            padding: '10px 14px',
            marginTop: 8,
          }}
        >
          <Line text="LOOP CONTRACT" color={theme.yellow} size={22} />
          <Line text="## Goal — what winning looks like" />
          <Line text="## Boundaries — solo vs escalate" />
          <Line text="## SOP — workflow to follow" />
        </div>
        <div
          style={{
            border: `2px solid ${theme.purple}`,
            borderRadius: 10,
            padding: '10px 14px',
            marginTop: 14,
          }}
        >
          <Line text="STATE + LOG" color={theme.purple} size={22} />
          <Line text="## State — durable picture, kept small" />
          <Line text="## Logs — append-only, run by run" />
        </div>
      </Box>

      {/* Trigger */}
      <Box x={760} y={120} w={560} h={300} title="TRIGGER" color={theme.orange} start={30} dashed>
        <Line text="#1 continuous for-loop → /goal" color={theme.text} />
        <Line text="#2 time-based cron → /loop · /schedule" color={theme.text} />
        <Line text="#3 event-based → webhook → local daemon" color={theme.text} />
        <Line text="#4 combo → cron + gate script" color={theme.text} />
        <Line text="   wake the agent only when there is real work" color={theme.green} />
      </Box>

      {/* Agents container */}
      <Box x={700} y={480} w={1120} h={520} title="AGENTS" color={theme.blue} start={120} dashed titleSize={22} />
      <Box x={1050} y={545} w={420} h={110} title="ORCHESTRATOR" color={theme.blue} start={120} titleSize={24}>
        <Line text="gather signals · prioritize · dispatch" size={19} />
      </Box>
      {execCenters.map((cx, i) => (
        <Box key={`e${i}`} x={cx - 140} y={715} w={280} h={90} title="Executor" color={theme.blue} start={240} titleSize={22}>
          <Line text="isolated worktree" size={18} />
        </Box>
      ))}
      {execCenters.map((cx, i) => (
        <Box key={`v${i}`} x={cx - 140} y={858} w={280} h={90} title="Verifier" color={theme.green} start={360} titleSize={22}>
          <Line text="test + evidence" size={18} />
        </Box>
      ))}

      {/* Arrows + data pulses */}
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <Arrow points={readmeToTrigger} color={theme.yellow} start={45} />
        <Pulse points={readmeToTrigger} color={theme.yellow} start={60} dur={70} />

        <Arrow points={triggerToOrch} color={theme.orange} start={135} />
        <Pulse points={triggerToOrch} color={theme.orange} start={150} dur={70} />

        {execCenters.map((cx, i) => (
          <React.Fragment key={i}>
            <Arrow points={orchToExec(cx)} color={theme.blue} start={255} />
            <Pulse points={orchToExec(cx)} color={theme.blue} start={270} dur={80} phase={i * 0.33} />
            <Arrow points={execDown(cx)} color={theme.blue} start={375} />
            <Arrow points={verUp(cx)} color={theme.green} start={375} />
            <Pulse points={execDown(cx)} color={theme.blue} start={390} dur={55} phase={i * 0.5} size={7} />
            <Pulse points={verUp(cx)} color={theme.green} start={410} dur={55} phase={i * 0.5} size={7} />
          </React.Fragment>
        ))}

        <Arrow points={backToReadme} color={theme.green} start={495} />
        <Pulse points={backToReadme} color={theme.green} start={510} dur={80} />
      </svg>

      <Caption text={caption} start={0} />
    </AbsoluteFill>
  );
};
