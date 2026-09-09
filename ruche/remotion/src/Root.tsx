import React from 'react';
import {Composition} from 'remotion';
import {Ruche} from './compositions/Ruche';
import {Spec} from './types';
import {sampleSpec} from './sample';

const totalFrames = (spec: Spec) => {
  const sum = (spec.scenes ?? []).reduce((acc, s) => acc + Math.max(1, s.frames || 0), 0);
  return sum > 0 ? sum : 300;
};

export const Root: React.FC = () => (
  <Composition
    id="Ruche"
    component={Ruche}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={totalFrames(sampleSpec)}
    defaultProps={{spec: sampleSpec}}
    calculateMetadata={({props}) => {
      const spec = (props as {spec: Spec}).spec ?? sampleSpec;
      return {durationInFrames: totalFrames(spec), fps: spec.fps || 30};
    }}
  />
);
