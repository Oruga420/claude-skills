export type SceneKind = 'title' | 'context' | 'beat' | 'decision' | 'result' | 'outro';

/** One spoken word, frames relative to the scene start. `w` keeps its punctuation. */
export type Word = {w: string; s: number; e: number};

export type Scene = {
  kind: SceneKind;
  heading: string;
  bullets: string[];
  /** filename inside remotion/public/ (generated image) or null for a plain backdrop */
  image: string | null;
  /** narration mp3 filename inside remotion/public/ */
  audio: string | null;
  /** sound effect mp3 filename inside remotion/public/, played at scene start */
  sfx: string | null;
  frames: number;
  /** global frame where the scene starts (papel) */
  start?: number;
  /** position of the scene in the video (papel) */
  index?: number;
  /** 1-based count among `beat` scenes, 0 otherwise: complexity grows with it (papel) */
  beat?: number;
  /** word timings of the narration (papel) */
  words?: Word[];
  /** [from, to] frames where nobody speaks: the moments of visual silence (papel) */
  pauses?: [number, number][];
};

/** Loudness per global frame (0..1) and candidate cut frames, computed from the real audio. */
export type AudioMap = {voice: number[]; music: number[]; onsets: number[]};

export type Spec = {
  title: string;
  subtitle: string;
  date: string;
  /** 'papel' = paper-and-ink motion graphics (default), 'cine' = the original image look */
  style?: 'papel' | 'cine';
  fps: number;
  /** filename inside remotion/public/ */
  bgm: string | null;
  musicVolume?: number;
  audioMap?: AudioMap | null;
  scenes: Scene[];
};

export const defaultSpec: Spec = {
  title: 'Sin titulo',
  subtitle: '',
  date: '',
  fps: 30,
  bgm: null,
  scenes: [],
};
