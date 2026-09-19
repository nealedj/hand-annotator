import './styles.css';
import './review.css';
import { jointsFor, VIEWBOX, type Joint } from './data/joints';
import { handArtwork, viewLabelText } from './render/artwork';
import { FONT_STACK, svg } from './render/svg';
import { el } from './editor/dom';
import { ulnarDirection, viewKey, viewLabel, VIEWS, type View } from './views';

/**
 * Clinical review page (milestone 2): every view with every snap point drawn,
 * numbered and listed. Review-only markup; the editor draws marks differently.
 */

const ACCENT = '#b34700';

/** Where to put a joint's number so badges don't collide: beside fingers, below the rest. */
function badgeOffset(view: View, joint: Joint): [number, number] {
  const gap = joint.r + 20;
  const ulnar = ulnarDirection(view);
  if (/^(index|middle|ring|little)-(dip|pip)$/.test(joint.id)) return [ulnar * gap, 0];
  if (joint.id.startsWith('thumb-')) return [-ulnar * gap, 0];
  return [0, gap];
}

function jointMarker(view: View, joint: Joint, n: number): SVGGElement {
  const [dx, dy] = badgeOffset(view, joint);
  return svg('g', { class: 'joint', 'data-joint': joint.id }, [
    svg('title', {}, [`${n}. ${joint.label}`]),
    svg('circle', {
      class: 'joint-radius',
      cx: joint.x,
      cy: joint.y,
      r: joint.r,
      fill: 'none',
      stroke: ACCENT,
      'stroke-width': 2.5,
      'stroke-dasharray': '8 6',
    }),
    svg('line', { x1: joint.x - 9, y1: joint.y, x2: joint.x + 9, y2: joint.y, stroke: ACCENT, 'stroke-width': 2.5 }),
    svg('line', { x1: joint.x, y1: joint.y - 9, x2: joint.x, y2: joint.y + 9, stroke: ACCENT, 'stroke-width': 2.5 }),
    svg('circle', {
      class: 'joint-badge',
      cx: joint.x + dx,
      cy: joint.y + dy,
      r: 17,
      fill: ACCENT,
      stroke: '#fff',
      'stroke-width': 3,
    }),
    svg(
      'text',
      {
        x: joint.x + dx,
        y: joint.y + dy,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': FONT_STACK,
        'font-size': 19,
        'font-weight': 700,
        fill: '#fff',
      },
      [String(n)],
    ),
  ]);
}

function viewSection(view: View): HTMLElement {
  const joints = jointsFor(view);
  const diagram = svg(
    'svg',
    {
      class: 'review-diagram',
      viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
      role: 'img',
      'aria-label': `${viewLabel(view)}, ${joints.length} snap points`,
    },
    [
      svg('rect', { width: VIEWBOX.width, height: VIEWBOX.height, fill: '#fff' }),
      handArtwork(view),
      viewLabelText(view),
      ...joints.map((j, i) => jointMarker(view, j, i + 1)),
    ],
  );

  const rows = joints.map((j, i) =>
    el('tr', { className: 'joint-row' }, [
      el('td', {}, [String(i + 1)]),
      el('td', {}, [j.label]),
      el('td', { className: 'num' }, [String(j.x)]),
      el('td', { className: 'num' }, [String(j.y)]),
      el('td', { className: 'num' }, [String(j.r)]),
    ]),
  );
  rows.forEach((row, i) => {
    const marker = diagram.querySelector(`[data-joint="${joints[i]!.id}"]`)!;
    const on = () => marker.classList.add('is-active');
    const off = () => marker.classList.remove('is-active');
    row.addEventListener('mouseenter', on);
    row.addEventListener('mouseleave', off);
    marker.addEventListener('mouseenter', () => row.classList.add('is-active'));
    marker.addEventListener('mouseleave', () => row.classList.remove('is-active'));
  });

  const key = viewKey(view);
  return el('section', { className: 'review-view', id: key }, [
    el('h2', {}, [viewLabel(view)]),
    el('div', { className: 'review-body' }, [
      el('div', { className: 'review-figure' }, [diagram]),
      el('table', { className: 'joint-table' }, [
        el('caption', {}, [`Snap points: ${key}`]),
        el('thead', {}, [
          el('tr', {}, ['#', 'Joint', 'x', 'y', 'Radius'].map((h) => el('th', { scope: 'col' }, [h]))),
        ]),
        el('tbody', {}, rows),
      ]),
    ]),
  ]);
}

const root = document.querySelector<HTMLDivElement>('#review')!;
root.append(
  el('header', { className: 'review-header' }, [
    el('h1', {}, ['Hand Map: artwork and snap point review']),
    el('p', {}, [
      'Draft for clinical sign-off. Each view shows the hand drawing and its 19 snap points. ',
      'The cross marks the exact snap position; the dashed circle is the default mark size.',
    ]),
    el('p', {}, [
      'To request a change, give the view, the number and the direction, for example ',
      el('q', {}, ['Right hand palmar, #6: move 3 mm proximally']),
      '. On the drawing, 1 mm is about 4 units. Hover over a row to find its point.',
    ]),
    el('nav', { ariaLabel: 'Views' }, [
      el(
        'ul',
        {},
        // Buttons that scroll, not #anchors: nothing on these pages may change the URL.
        VIEWS.map((v) =>
          el('li', {}, [
            el('button', { type: 'button', onclick: () => document.getElementById(viewKey(v))?.scrollIntoView() }, [
              viewLabel(v),
            ]),
          ]),
        ),
      ),
    ]),
  ]),
  el('main', {}, VIEWS.map(viewSection)),
);
