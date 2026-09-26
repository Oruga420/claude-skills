import {loadFont as loadArchivo} from '@remotion/google-fonts/ArchivoBlack';
import {loadFont as loadSerif} from '@remotion/google-fonts/InstrumentSerif';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {random} from 'remotion';

/**
 * The papel language. Three inks on one stock, like a two-color risograph job that got a
 * third pass: ink does the work, signal marks what matters, pencil is the draft layer.
 * Nothing else gets a color.
 */
export const P = {
  paper: '#efe8da',
  paperDeep: '#e3d9c5',
  ink: '#16130f',
  signal: '#ff4a1c',
  pencil: '#8d8575',
  blue: '#2345d8',
};

export const F = {
  display: loadArchivo('normal', {weights: ['400'], subsets: ['latin', 'latin-ext']}).fontFamily,
  serif: loadSerif('italic', {weights: ['400'], subsets: ['latin', 'latin-ext']}).fontFamily,
  mono: loadMono('normal', {weights: ['400', '700'], subsets: ['latin', 'latin-ext']}).fontFamily,
};

export const W = 1920;
export const H = 1080;

/** Hand-drawn things are animated "on twos/threes": the boil ticks every BOIL frames. */
export const BOIL = 3;

export const rnd = (seed: string | number, lo = 0, hi = 1) => lo + random(String(seed)) * (hi - lo);

/** Lowercase, no accents, no punctuation: how spoken words are matched against the page. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Font size so `text` fills `width` in the display face (Archivo Black runs ~0.66em/char). */
export const fitSize = (text: string, width: number, max: number, min = 40, em = 0.66) =>
  Math.max(min, Math.min(max, width / Math.max(1, text.length * em)));

let ctx: CanvasRenderingContext2D | null = null;

/** Rendered width of `text` in the display face, letter-spacing included (fonts are loaded before render). */
export const textWidth = (text: string, size: number, font = F.display, tracking = -0.035) => {
  ctx = ctx ?? document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * size * 0.62;
  ctx.font = `${size}px "${font}"`;
  return ctx.measureText(text).width + text.length * size * tracking;
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Stepped ease: motion that snaps in a few hard frames instead of gliding. */
export const snap = (frame: number, at: number, dur = 5) => {
  const t = clamp01((frame - at) / dur);
  return Math.round(t * 4) / 4;
};
