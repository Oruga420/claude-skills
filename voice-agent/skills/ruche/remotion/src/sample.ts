import {Spec} from './types';

export const sampleSpec: Spec = {
  title: 'Ruche',
  subtitle: 'Resumen de la conversacion',
  date: '2026-09-09',
  fps: 30,
  bgm: null,
  scenes: [
    {kind: 'title', heading: 'Ruche', bullets: [], image: null, audio: null, sfx: null, frames: 120},
    {
      kind: 'context',
      heading: 'De donde venimos',
      bullets: ['Se pidio instalar dos skills nuevas', 'Se bajaron del repo personal'],
      image: null,
      audio: null,
      sfx: null,
      frames: 180,
    },
    {
      kind: 'result',
      heading: 'Que quedo',
      bullets: ['take-controlish instalada', 'take-control-full instalada'],
      image: null,
      audio: null,
      sfx: null,
      frames: 180,
    },
    {kind: 'outro', heading: 'Siguiente paso', bullets: ['Probar /ruche'], image: null, audio: null, sfx: null, frames: 120},
  ],
};
