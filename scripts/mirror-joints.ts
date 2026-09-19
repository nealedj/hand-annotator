/**
 * Rewrites the left-hand views in src/data/joints.json from the right-hand views.
 *
 *   node scripts/mirror-joints.ts
 *
 * The left-hand artwork is the right-hand artwork mirrored, so the left snap points
 * must be the right ones mirrored: x becomes (viewBox width - x), y and r are unchanged.
 * Edit the right-hand views, then run this. tests/unit/joints.test.ts checks it was done.
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface Joint {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
}
interface JointsFile {
  viewBox: { width: number; height: number };
  views: Record<string, Joint[]>;
}

const file = new URL('../src/data/joints.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8')) as JointsFile;

const mirror = (list: Joint[]): Joint[] =>
  list.map((j) => ({ ...j, label: j.label.replace(/^Right /, 'Left '), x: data.viewBox.width - j.x }));

const views: Record<string, Joint[]> = {
  'left-palmar': mirror(data.views['right-palmar']!),
  'left-dorsal': mirror(data.views['right-dorsal']!),
  'right-palmar': data.views['right-palmar']!,
  'right-dorsal': data.views['right-dorsal']!,
};

// One joint per line keeps diffs readable when a clinician moves a point.
const body = Object.entries(views)
  .map(([k, list]) => `    "${k}": [\n${list.map((j) => `      ${JSON.stringify(j)}`).join(',\n')}\n    ]`)
  .join(',\n');
const { width, height } = data.viewBox;
writeFileSync(file, `{\n  "viewBox": { "width": ${width}, "height": ${height} },\n  "views": {\n${body}\n  }\n}\n`);
console.log('Mirrored right-hand snap points into the left-hand views.');
