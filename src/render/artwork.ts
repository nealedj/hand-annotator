import palmarSource from '../assets/hand-palmar.svg?raw';
import dorsalSource from '../assets/hand-dorsal.svg?raw';
import { VIEWBOX } from '../data/joints';
import { viewLabel, type Side, type View } from '../views';
import { FONT_STACK, svg } from './svg';

const sources: Record<Side, string> = { palmar: palmarSource, dorsal: dorsalSource };
const parsed = new Map<Side, Element>();

function artworkRoot(side: Side): Element {
  let root = parsed.get(side);
  if (!root) {
    root = new DOMParser().parseFromString(sources[side], 'image/svg+xml').documentElement;
    parsed.set(side, root);
  }
  return root;
}

/**
 * The hand drawing for a view. The artwork is a right hand; left views mirror it,
 * which is why palmar and dorsal are separate drawings.
 */
export function handArtwork(view: View): SVGGElement {
  const g = svg('g', { class: 'hand-artwork' });
  if (view.hand === 'left') g.setAttribute('transform', `translate(${VIEWBOX.width} 0) scale(-1 1)`);
  for (const child of Array.from(artworkRoot(view.side).children)) {
    g.append(document.importNode(child, true));
  }
  return g;
}

/** The view label, top left of the diagram. Present in the editor and the export. */
export function viewLabelText(view: View): SVGTextElement {
  return svg(
    'text',
    {
      class: 'view-label',
      x: 48,
      y: 84,
      'font-family': FONT_STACK,
      'font-size': 46,
      'font-weight': 700,
      'letter-spacing': 1,
      fill: '#1f2328',
    },
    [viewLabel(view)],
  );
}
