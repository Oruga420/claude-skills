export type SceneKind = 'title' | 'context' | 'beat' | 'decision' | 'result' | 'outro';

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
};

export type Spec = {
  title: string;
  subtitle: string;
  date: string;
  fps: number;
  /** filename inside remotion/public/ */
  bgm: string | null;
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
