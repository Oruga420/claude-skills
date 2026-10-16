import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Software GL and one tab: the headless page can crash mid render while the GPU is
// saturated by a local image model (ComfyUI) running at the same time.
Config.setChromiumOpenGlRenderer('swangle');
Config.setConcurrency(1);
Config.setTimeoutInMilliseconds(120000);
