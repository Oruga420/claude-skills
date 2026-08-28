import {Composition} from 'remotion';
import {LoopAnatomy} from './compositions/LoopAnatomy';
import {TriggerTypes} from './compositions/TriggerTypes';
import {EvolveLoop} from './compositions/EvolveLoop';
import {DocMaintainer} from './compositions/DocMaintainer';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="LoopAnatomy"
        component={LoopAnatomy}
        durationInFrames={720}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TriggerTypes"
        component={TriggerTypes}
        durationInFrames={660}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="EvolveLoop"
        component={EvolveLoop}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="DocMaintainer"
        component={DocMaintainer}
        durationInFrames={660}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
