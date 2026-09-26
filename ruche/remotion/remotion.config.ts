import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Software GL and one tab: the headless page crashed mid render while the GPU was
// saturated by ComfyUI (2026-09-09, frame 2874 of 4670).
Config.setChromiumOpenGlRenderer('swangle');
Config.setConcurrency(1);
Config.setTimeoutInMilliseconds(120000);
