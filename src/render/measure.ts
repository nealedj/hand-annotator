import { CALLOUT } from '../layout/callouts';
import type { Measure } from '../layout/text';
import { FONT_STACK } from './svg';

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

/**
 * Measures callout text with a canvas in the same font the SVG uses, so wrapping in
 * the editor and in the exported PNG (drawn by the same browser) agree.
 */
export const measureText: Measure = (text, bold) => {
  const key = `${bold ? 'b' : 'r'}${text}`;
  let w = cache.get(key);
  if (w === undefined) {
    ctx ??= document.createElement('canvas').getContext('2d')!;
    ctx.font = `${bold ? 700 : 400} ${CALLOUT.fontSize}px ${FONT_STACK}`;
    w = ctx.measureText(text).width;
    if (cache.size > 5000) cache.clear();
    cache.set(key, w);
  }
  return w;
};
