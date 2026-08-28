import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import {Arrow, BigTitle, Box, Caption, Line, Pulse, theme, Pt, useFadeIn} from '../ui';

// Recreation of the video's EVOLVE diagram: a weekly agent session reads the
// execution loop's history and outputs changes to the LOOP itself, not the product.
export const EvolveLoop: React.FC = () => {
  const frame = useCurrentFrame();

  const runXs = Array.from({length: 12}, (_, i) => 220 + i * 130);
  const failIdx = [3, 8];
  const timelineY = 900;

  const readPath: Pt[] = [
    [520, timelineY - 30],
    [430, 700],
    [380, 570],
  ];
  const evolveToOutput: Pt[] = [
    [620, 470],
    [755, 470],
  ];
  const obeyPath: Pt[] = [
    [1290, 745],
    [1290, 830],
    [1560, 830],
    [1560, timelineY - 25],
  ];

  const evolveFade = useFadeIn(150);

  return (
    <AbsoluteFill style={{background: theme.bg}}>
      <BigTitle text="THE EVOLVE LOOP" sub="every 5–10 runs, an agent session improves the loop itself" />

      {/* Execution timeline */}
      <div
        style={{
          position: 'absolute',
          left: 220,
          top: timelineY + 40,
          fontFamily: theme.font,
          fontSize: 26,
          color: theme.text,
          fontWeight: 700,
          opacity: interpolate(frame, [0, 15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        EXECUTION LOOP · fires daily
      </div>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <Arrow points={[[180, timelineY], [1780, timelineY]]} color={theme.stroke} start={5} drawDur={30} />
      </svg>
      {runXs.map((x, i) => {
        const at = 20 + i * 10;
        const isFail = failIdx.includes(i);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - 13,
              top: timelineY - 13,
              width: 26,
              height: 26,
              borderRadius: 13,
              background: isFail ? theme.red : theme.orange,
              fontFamily: theme.font,
              fontSize: 16,
              color: '#000',
              textAlign: 'center',
              lineHeight: '26px',
              opacity: interpolate(frame, [at, at + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
            }}
          >
            {isFail ? '✗' : ''}
          </div>
        );
      })}

      {/* Evolve box */}
      <Box x={160} y={400} w={460} h={170} title="🧬 EVOLVE" color={theme.purple} start={150} titleSize={34}>
        <Line text="an agent session · fires weekly" size={22} color={theme.text} />
        <Line text="reads the loop's history, not the task" size={22} color={theme.text} />
      </Box>
      <div
        style={{
          position: 'absolute',
          left: 200,
          top: 660,
          fontFamily: theme.font,
          fontSize: 20,
          color: theme.dim,
          ...evolveFade,
        }}
      >
        reads the last dozen runs:
        <br />
        config · state · logs · raw conversations
      </div>

      {/* Output panel */}
      <Box
        x={755}
        y={170}
        w={1080}
        h={575}
        title="OUTPUT · changes to the loop, not the product"
        color={theme.orange}
        start={300}
        dashed
        titleSize={26}
      />
      <Box x={790} y={250} w={490} h={200} title="CONTRACT.md · the diff" color={theme.text} start={330} titleSize={22}>
        <Line text="+ never trust the profile label" color={theme.green} />
        <Line text="+ never stack a 2nd open PR" color={theme.green} />
        <Line text="mostly new don'ts (via negativa)" color={theme.orange} />
      </Box>
      <Box x={1320} y={250} w={480} h={200} title="STATE.md · pruned" color={theme.text} start={360} titleSize={22}>
        <Line text="12 scattered lessons" color={theme.dim} />
        <Line text="→ 4 durable rules kept" color={theme.green} />
        <Line text="smaller state, sharper reads" />
      </Box>
      <Box x={790} y={490} w={490} h={220} title="prestage.workflow.js ⚡" color={theme.text} start={390} titleSize={22}>
        <Line text="pull → filter → format" color={theme.blue} />
        <Line text="runs BEFORE the agent wakes" color={theme.orange} />
        <Line text="deterministic = cheap + zero variance" />
      </Box>
      <Box x={1320} y={490} w={480} h={220} title="loop settings" color={theme.text} start={420} titleSize={22}>
        <Line text="⏰ dumb cron → workflow trigger" color={theme.blue} />
        <Line text="🛠 skills updated" />
        <Line text="📊 dashboard refreshed" />
      </Box>

      {/* Flows */}
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <Arrow points={readPath} color={theme.dim} start={165} dashed />
        <Pulse points={readPath} color={theme.purple} start={185} dur={60} phase={0} size={7} />
        <Pulse points={readPath} color={theme.purple} start={185} dur={60} phase={0.5} size={7} />

        <Arrow points={evolveToOutput} color={theme.orange} start={310} width={5} />
        <Pulse points={evolveToOutput} color={theme.orange} start={320} dur={40} />

        <Arrow points={obeyPath} color={theme.green} start={470} dashed />
        <Pulse points={obeyPath} color={theme.green} start={490} dur={70} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 1330,
          top: 770,
          fontFamily: theme.font,
          fontSize: 22,
          color: theme.green,
          opacity: interpolate(frame, [480, 500], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        next runs obey the new loop
      </div>

      <Caption text="the LLM optimizes its own loop: contract, state, trigger scripts, settings" start={520} y={1010} />
    </AbsoluteFill>
  );
};
