export type Verdict = 'SURVIVED' | 'KILLED' | 'UNVERIFIABLE' | 'FIXED';

export type SceneKind =
  | 'title'
  | 'objective'
  | 'phases'
  | 'judge'
  | 'contract'
  | 'screens'
  | 'status';

/** A product mock rendered as a PNG in remotion/public/, shown by the `screens` scene. */
export type Screen = {file: string; label: string; caption: string};

export type Spec = {
  title: string;
  subtitle: string;
  date: string;
  /** 'controlish' = stops at the contract for the operator. 'full' = built with /fable-it. */
  mode: 'controlish' | 'full';
  fps: number;
  objective: string;
  notScope: string[];
  phases: {n: number; name: string; detail: string}[];
  judge: {
    score: number;
    rounds: number;
    claims: {claim: string; verdict: Verdict}[];
    changes: string[];
  };
  contract: {
    name: string;
    path: string;
    acceptance: {check: string; green: string}[];
  };
  status: {headline: string; detail: string; next: string};
  artifacts: {label: string; path: string}[];
  /** product mocks for the `screens` scene; files live in remotion/public/ */
  screens: Screen[];
  /** filename inside remotion/public/ */
  bgm: string | null;
  scenes: {kind: SceneKind; frames: number; audio: string | null}[];
};

export const defaultSpec: Spec = {
  title: 'Sin titulo',
  subtitle: '',
  date: '',
  mode: 'controlish',
  fps: 30,
  objective: '',
  notScope: [],
  phases: [],
  judge: {score: 0, rounds: 0, claims: [], changes: []},
  contract: {name: '', path: '', acceptance: []},
  status: {headline: '', detail: '', next: ''},
  artifacts: [],
  screens: [],
  bgm: null,
  scenes: [],
};
