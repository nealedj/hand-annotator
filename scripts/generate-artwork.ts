/**
 * Generates the hand artwork (src/assets/hand-palmar.svg, src/assets/hand-dorsal.svg)
 * and, with --joints, the initial snap points (src/data/joints.json).
 *
 *   node scripts/generate-artwork.ts            # artwork only
 *   node scripts/generate-artwork.ts --joints   # artwork and joints.json (overwrites!)
 *
 * Everything is built from one skeleton of a right hand in millimetres, so the drawing
 * and the joint positions agree. Coordinates: x towards the thumb side of the palmar
 * view, y distal (towards the fingertips), origin at the centre of the distal wrist
 * crease. The dorsal drawing uses the same skeleton, mirrored left to right.
 *
 * After clinical sign-off, joints.json is the source of truth: adjust snap points by
 * editing it (and `npm run joints:mirror`), not by re-running this with --joints.
 */
import { writeFileSync } from 'node:fs';

type P = readonly [number, number];

// ---- Canvas -------------------------------------------------------------------------

const W = 1200;
const H = 1400;
const S = 4; // viewBox units per millimetre
const ORIGIN_X = 540;
const ORIGIN_Y = 910;
const FOREARM_END = -85; // distal third of the forearm, in mm from the wrist crease

const COLOURS = {
  outline: '#6b7178',
  fill: '#f4f2ef',
  crease: '#99a0a7',
  contour: '#c4c8cc',
};

// ---- Vector helpers -----------------------------------------------------------------

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const norm = (a: P): P => mul(a, 1 / len(a));
const mid = (a: P, b: P): P => mul(add(a, b), 0.5);
/** Unit vector at `deg` degrees from distal, positive towards +x. */
const dirDeg = (deg: number): P => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
/** Perpendicular pointing to the +x side of a distal-pointing direction. */
const perp = (d: P): P => [d[1], -d[0]];

// ---- Digits -------------------------------------------------------------------------

interface Digit {
  name: 'thumb' | 'index' | 'middle' | 'ring' | 'little';
  /** Joint centres proximal to distal, then the tip. Fingers: MCP, PIP, DIP, tip. Thumb: CMC, MCP, IP, tip. */
  axis: P[];
  /** Width profile: [arc length from axis[0], full width] in mm. */
  widths: [number, number][];
}

function cumulative(d: Digit): number[] {
  const out = [0];
  for (let i = 1; i < d.axis.length; i++) out.push(out[i - 1]! + len(sub(d.axis[i]!, d.axis[i - 1]!)));
  return out;
}

function segDir(d: Digit, i: number): P {
  const n = d.axis.length - 1;
  const j = Math.max(0, Math.min(n - 1, i));
  return norm(sub(d.axis[j + 1]!, d.axis[j]!));
}

/** Position and (smoothed) direction at arc length s. Extrapolates before the base. */
function frame(d: Digit, s: number): { p: P; dir: P } {
  const cum = cumulative(d);
  let i = 0;
  while (i < cum.length - 2 && s > cum[i + 1]!) i++;
  const dir0 = segDir(d, i);
  const p = add(d.axis[i]!, mul(dir0, s - cum[i]!));
  // Blend directions within 5 mm of a joint so outlines bend smoothly.
  const blend = 5;
  let dir = dir0;
  const toNext = cum[i + 1]! - s;
  const fromPrev = s - cum[i]!;
  if (i < cum.length - 2 && toNext < blend) {
    const k = 0.5 * (1 - toNext / blend);
    dir = norm(add(mul(dir0, 1 - k), mul(segDir(d, i + 1), k)));
  } else if (i > 0 && fromPrev < blend) {
    const k = 0.5 * (1 - fromPrev / blend);
    dir = norm(add(mul(dir0, 1 - k), mul(segDir(d, i - 1), k)));
  }
  return { p, dir };
}

function widthAt(d: Digit, s: number): number {
  const w = d.widths;
  if (s <= w[0]![0]) return w[0]![1];
  for (let i = 1; i < w.length; i++) {
    const [s1, w1] = w[i]!;
    const [s0, w0] = w[i - 1]!;
    if (s <= s1) return w0 + ((w1 - w0) * (s - s0)) / (s1 - s0);
  }
  return w[w.length - 1]![1];
}

/** Point at arc length s, offset sideways by `off` mm (+ towards the +x side). */
function at(d: Digit, s: number, off = 0): P {
  const { p, dir } = frame(d, s);
  return add(p, mul(perp(dir), off));
}

/** Point on the digit's edge at s. side = +1 or -1. */
const edge = (d: Digit, s: number, side: 1 | -1, inset = 0) => at(d, s, side * (widthAt(d, s) / 2 - inset));

const tipS = (d: Digit) => cumulative(d)[d.axis.length - 1]!;
const jointS = (d: Digit, i: number) => cumulative(d)[i]!;

function digitOutline(d: Digit): P[] {
  const end = tipS(d);
  const r = widthAt(d, end) / 2;
  const samples = d.widths.map(([s]) => s).filter((s) => s < end - r);
  samples.push(end - r);
  const right = samples.map((s) => edge(d, s, 1));
  const left = samples.map((s) => edge(d, s, -1)).reverse();
  const { p: c, dir } = frame(d, end - r);
  const tip: P[] = [45, 90, 135].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return add(c, add(mul(perp(dir), r * Math.cos(t)), mul(dir, r * Math.sin(t) * 1.08)));
  });
  return [...right, ...tip, ...left];
}

function finger(
  name: Digit['name'],
  mcp: P,
  angle: number,
  [lp, lm, ld]: [number, number, number],
  [wBase, wPip, wMid, wDip, wPad]: [number, number, number, number, number],
): Digit {
  const d = dirDeg(angle);
  const pip = add(mcp, mul(d, lp));
  const dip = add(pip, mul(d, lm));
  const tip = add(dip, mul(d, ld));
  return {
    name,
    axis: [mcp, pip, dip, tip],
    widths: [
      [-8, wBase],
      [0, wBase],
      [lp * 0.5, (wBase + wPip) / 2 - 0.8],
      [lp, wPip],
      [lp + lm * 0.5, wMid],
      [lp + lm, wDip],
      [lp + lm + ld * 0.45, wPad],
    ],
  };
}

// Right hand, palmar frame. Proportions for an adult hand about 190 mm long
// (distal wrist crease to middle fingertip).
const INDEX = finger('index', [21, 83], 12, [42, 25, 24], [20, 19, 16.5, 16.5, 16]);
const MIDDLE = finger('middle', [0, 86], 2, [46, 29, 28], [20.5, 19.5, 17, 17, 16.5]);
const RING = finger('ring', [-19, 81], -9, [43, 27, 26], [19, 18.5, 16, 16, 15.5]);
const LITTLE = finger('little', [-36, 71], -19, [34, 20, 22], [16.5, 15.5, 13.5, 13.5, 13]);
const FINGERS = [INDEX, MIDDLE, RING, LITTLE];

const THUMB: Digit = (() => {
  const cmc: P = [25, 14];
  const mcp = add(cmc, mul(dirDeg(42), 44));
  const ip = add(mcp, mul(dirDeg(32), 31));
  const tip = add(ip, mul(dirDeg(24), 28));
  return {
    name: 'thumb',
    axis: [cmc, mcp, ip, tip],
    widths: [
      [-5, 15],
      [0, 19],
      [20, 23.5],
      [44, 23.5],
      [59, 21],
      [75, 21.5],
      [87, 21.5],
    ],
  };
})();

// ---- Palm and forearm ---------------------------------------------------------------

/** How far palm join points sit inside a digit, so the palm's stroke hides under the digit's fill. */
const JOIN_INSET = 1.3;

function palmPoints(): P[] {
  // Inside points sit on a finger's axis so the joins are hidden under the finger fill.
  const inside = (d: Digit, s = 10) => at(d, s);
  /** A rounded web between two digits: up each facing edge, through a U at the web. */
  const web = (a: Digit, sa: number, sideA: 1 | -1, b: Digit, sb: number, sideB: 1 | -1): P[] => [
    edge(a, sa + 9, sideA, JOIN_INSET),
    edge(a, sa + 4, sideA, 0.4),
    mid(edge(a, sa, sideA), edge(b, sb, sideB)),
    edge(b, sb + 4, sideB, 0.4),
    edge(b, sb + 9, sideB, JOIN_INSET),
  ];

  // First web space, a broad U from the thumb's proximal phalanx to the index base.
  const firstWebThumb = edge(THUMB, 54, -1, 0.4);
  const firstWebIndex = edge(INDEX, 12, 1, 0.4);
  const chord = sub(firstWebIndex, firstWebThumb);
  const bow = mul(norm([chord[1], -chord[0]]), 4.5); // towards the palm
  const firstWebMid = add(mid(firstWebThumb, firstWebIndex), bow);

  return [
    // Radial border, forearm to thumb, with the thenar eminence
    [34.5, FOREARM_END],
    [33.5, -60],
    [31.5, -30],
    [30.5, -8],
    [33.5, 3],
    [42, 11],
    [52, 25],
    edge(THUMB, 38, 1, 0.4),
    edge(THUMB, 46, 1, JOIN_INSET),
    inside(THUMB, 56),
    // First web space
    edge(THUMB, 62, -1, JOIN_INSET),
    firstWebThumb,
    firstWebMid,
    firstWebIndex,
    edge(INDEX, 20, 1, JOIN_INSET),
    // Finger webs, radial to ulnar
    inside(INDEX, 22),
    ...web(INDEX, 16, -1, MIDDLE, 16, 1),
    inside(MIDDLE, 22),
    ...web(MIDDLE, 16, -1, RING, 15, 1),
    inside(RING, 22),
    ...web(RING, 13, -1, LITTLE, 10, 1),
    inside(LITTLE, 18),
    // Ulnar border, little finger to forearm
    edge(LITTLE, 10, -1, JOIN_INSET),
    edge(LITTLE, 3, -1, 0.4),
    [-44.5, 58],
    [-45.5, 45],
    [-42.5, 28],
    [-36, 10],
    [-31, -6],
    [-32.5, -30],
    [-34, -60],
    [-35.5, FOREARM_END],
  ];
}

// ---- Joints -------------------------------------------------------------------------

type JointId =
  | `${'index' | 'middle' | 'ring' | 'little'}-${'dip' | 'pip' | 'mcp'}`
  | `thumb-${'ip' | 'mcp' | 'cmc'}`
  | 'radiocarpal'
  | 'druj'
  | 'radial-styloid'
  | 'ulnar-styloid';

interface JointDef {
  id: JointId;
  name: string; // label without the hand, e.g. "index PIP"
  p: P;
  r: number; // default mark radius, viewBox units
}

function jointDefs(): JointDef[] {
  const out: JointDef[] = [];
  for (const f of FINGERS) {
    const small = f.name === 'little';
    out.push(
      { id: `${f.name}-dip` as JointId, name: `${f.name} DIP`, p: f.axis[2]!, r: small ? 26 : 30 },
      { id: `${f.name}-pip` as JointId, name: `${f.name} PIP`, p: f.axis[1]!, r: small ? 30 : 34 },
      { id: `${f.name}-mcp` as JointId, name: `${f.name} MCP`, p: f.axis[0]!, r: small ? 34 : 38 },
    );
  }
  out.push(
    { id: 'thumb-ip', name: 'thumb IP', p: THUMB.axis[2]!, r: 34 },
    { id: 'thumb-mcp', name: 'thumb MCP', p: THUMB.axis[1]!, r: 40 },
    { id: 'thumb-cmc', name: 'thumb CMC', p: THUMB.axis[0]!, r: 40 },
    { id: 'radiocarpal', name: 'radiocarpal joint', p: [2, -9], r: 48 },
    { id: 'druj', name: 'DRUJ', p: [-17, -14], r: 32 },
    { id: 'radial-styloid', name: 'radial styloid', p: [29, -3], r: 32 },
    { id: 'ulnar-styloid', name: 'ulnar styloid', p: [-28, -8], r: 30 },
  );
  return out;
}

// ---- SVG output ---------------------------------------------------------------------

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

function toUnits(p: P, mirror: boolean): P {
  const x = ORIGIN_X + S * p[0];
  return [mirror ? W - x : x, ORIGIN_Y - S * p[1]];
}

/** Catmull-Rom spline through points, as cubic Bézier path data. */
function spline(pts: P[], closed: boolean): string {
  const n = pts.length;
  const get = (i: number): P => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  let d = `M${fmt(pts[0]![0])} ${fmt(pts[0]![1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

type Side = 'palmar' | 'dorsal';

/** A smooth cap over a knuckle at arc length s: an arc bulging distally by `bow` mm. */
function cap(d: Digit, s: number, frac: number, bow: number): P[] {
  const half = (widthAt(d, s) / 2) * frac;
  return [-1, -0.7, 0, 0.7, 1].map((k) => at(d, s + bow * Math.sqrt(1 - k * k), k * half));
}

/** A crease line across a digit at arc length s, bowed distally by `bow` mm. */
function across(d: Digit, s: number, frac: number, bow = 0.8): P[] {
  const half = (widthAt(d, s) / 2) * frac;
  return [at(d, s - bow * 0.4, -half), at(d, s + bow, 0), at(d, s - bow * 0.4, half)];
}

function palmarDetails(): { creases: P[][]; contours: P[][] } {
  const creases: P[][] = [];
  // Palmar creases
  creases.push([[-44.5, 63], [-30, 72], [-13, 80], [1, 88.5], [9.5, 98]]); // distal palmar
  creases.push([[31, 82.5], [18, 77], [0, 70], [-17, 60.5], [-28, 53]]); // proximal palmar
  creases.push([[29.5, 80.5], [21, 66], [14.5, 48], [11.5, 30], [10.5, 14], [10.5, 4]]); // thenar
  creases.push([[-27.5, -1.5], [0, 1.5], [27.5, -1]]); // distal wrist
  creases.push([[-27, -10.5], [0, -8.5], [27, -10.5]]); // proximal wrist
  // Digital creases: proximal (at the web, well distal to the MCP joint), middle (PIP), distal (DIP)
  const proximal: Record<string, number> = { index: 20, middle: 21, ring: 20, little: 15 };
  for (const f of FINGERS) {
    const pip = jointS(f, 1);
    const dip = jointS(f, 2);
    creases.push(across(f, proximal[f.name]!, 0.78));
    creases.push(across(f, pip - 1.2, 0.8), across(f, pip + 1, 0.7));
    creases.push(across(f, dip - 1.2, 0.72));
  }
  const tMcp = jointS(THUMB, 1);
  const tIp = jointS(THUMB, 2);
  creases.push(across(THUMB, tMcp + 2, 0.75, 1.2), across(THUMB, tMcp + 5, 0.6, 1));
  creases.push(across(THUMB, tIp - 0.5, 0.75, 1.2));

  // Faint contours for the thenar and hypothenar eminences
  const contours: P[][] = [
    [[-19, 5], [-26, 22], [-31.5, 42], [-33, 56]],
    [[18, 6], [30, 18], [41, 33], [47, 44]],
  ];
  return { creases, contours };
}

function dorsalDetails(): { creases: P[][]; contours: P[][]; nails: P[][] } {
  const creases: P[][] = [];
  const contours: P[][] = [];
  const nails: P[][] = [];

  /** Six points: cuticle left, middle, right; free edge right, middle, left. */
  const nail = (d: Digit): P[] => {
    const dip = jointS(d, 2); // DIP, or thumb IP
    const end = tipS(d);
    const base = dip + 0.36 * (end - dip);
    const top = end - 2.4;
    const wb = widthAt(d, base) * 0.3;
    const wt = widthAt(d, top - 3) * 0.33;
    return [
      at(d, base + 1.8, -wb),
      at(d, base - 1.2, 0),
      at(d, base + 1.8, wb),
      at(d, top - 3.2, wt),
      at(d, top + 0.6, 0),
      at(d, top - 3.2, -wt),
    ];
  };

  for (const f of [...FINGERS, THUMB]) {
    const isThumb = f.name === 'thumb';
    const j1 = jointS(f, isThumb ? 2 : 1); // PIP, or thumb IP
    // Knuckle wrinkles over the PIP (thumb IP)
    creases.push(across(f, j1 - 2.4, 0.42, -0.7), across(f, j1, 0.56, -0.9), across(f, j1 + 2.4, 0.46, -0.7));
    if (!isThumb) {
      const dip = jointS(f, 2);
      creases.push(across(f, dip - 0.8, 0.4, -0.6), across(f, dip + 1, 0.34, -0.5));
      // Knuckle over the MCP head
      contours.push(cap(f, -2, 0.6, 4.5));
    } else {
      contours.push(cap(f, jointS(f, 1) - 2, 0.6, 4.5));
    }
  }
  // Ulnar head prominence
  contours.push([[-24, -6], [-28.5, -12.5], [-25, -19]]);

  for (const d of [...FINGERS, THUMB]) nails.push(nail(d));
  return { creases, contours, nails };
}

function nailPath(pts: P[], mirror: boolean): string {
  const u = pts.map((p) => toUnits(p, mirror));
  const [bl, bm, br, tr, tm, tl] = u as [P, P, P, P, P, P];
  // Quadratic curves through the cuticle and free-edge midpoints (control = 2*mid - avg(ends)).
  const ctrl = (a: P, m: P, b: P): P => sub(mul(m, 2), mid(a, b));
  const cb = ctrl(bl, bm, br);
  const ct = ctrl(tr, tm, tl);
  return (
    `M${fmt(bl[0])} ${fmt(bl[1])}Q${fmt(cb[0])} ${fmt(cb[1])} ${fmt(br[0])} ${fmt(br[1])}` +
    `L${fmt(tr[0])} ${fmt(tr[1])}Q${fmt(ct[0])} ${fmt(ct[1])} ${fmt(tl[0])} ${fmt(tl[1])}Z`
  );
}

function handSvg(side: Side): string {
  const mirror = side === 'dorsal';
  const u = (pts: P[]) => pts.map((p) => toUnits(p, mirror));
  const palm = u(palmPoints());
  const palmOpen = spline(palm, false);
  const palmClosed = palmOpen + 'Z';
  const digits = [LITTLE, RING, MIDDLE, INDEX, THUMB].map((d) => spline(u(digitOutline(d)), true));

  const lines = (list: P[][]) => list.map((l) => `    <path d="${spline(u(l), false)}"/>`).join('\n');

  let details: string;
  if (side === 'palmar') {
    const { creases, contours } = palmarDetails();
    details = [
      `  <g class="hand-contours" fill="none" stroke="${COLOURS.contour}" stroke-width="2.2" stroke-linecap="round">`,
      lines(contours),
      '  </g>',
      `  <g class="hand-creases" fill="none" stroke="${COLOURS.crease}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">`,
      lines(creases),
      '  </g>',
    ].join('\n');
  } else {
    const { creases, contours, nails } = dorsalDetails();
    details = [
      `  <g class="hand-contours" fill="none" stroke="${COLOURS.contour}" stroke-width="2.2" stroke-linecap="round">`,
      lines(contours),
      '  </g>',
      `  <g class="hand-creases" fill="none" stroke="${COLOURS.crease}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">`,
      lines(creases),
      '  </g>',
      `  <g class="hand-nails" fill="#fbfaf8" stroke="${COLOURS.crease}" stroke-width="2.4" stroke-linejoin="round">`,
      nails.map((n) => `    <path d="${nailPath(n, mirror)}"/>`).join('\n'),
      '  </g>',
    ].join('\n');
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `  <!-- Right hand, ${side} view. Generated by scripts/generate-artwork.ts; edit that, not this file. -->`,
    `  <!-- Presentation attributes only: the app's CSP blocks inline style. -->`,
    `  <g class="hand-outline" fill="none" stroke="${COLOURS.outline}" stroke-width="7" stroke-linejoin="round">`,
    `    <path d="${palmOpen}"/>`,
    ...digits.map((d) => `    <path d="${d}"/>`),
    '  </g>',
    `  <g class="hand-fill" fill="${COLOURS.fill}">`,
    `    <path d="${palmClosed}"/>`,
    ...digits.map((d) => `    <path d="${d}"/>`),
    '  </g>',
    details,
    '</svg>',
    '',
  ].join('\n');
}

// ---- Joints JSON --------------------------------------------------------------------

function jointsJson(): string {
  const views: Record<string, unknown[]> = {};
  const order: [string, 'Left' | 'Right', Side][] = [
    ['left-palmar', 'Left', 'palmar'],
    ['left-dorsal', 'Left', 'dorsal'],
    ['right-palmar', 'Right', 'palmar'],
    ['right-dorsal', 'Right', 'dorsal'],
  ];
  for (const [key, hand, side] of order) {
    // Left views are the right-hand drawings mirrored, so right dorsal and left palmar
    // share positions, as do right palmar and left dorsal.
    const mirror = (hand === 'Right') !== (side === 'palmar');
    views[key] = jointDefs().map((j) => {
      const [x, y] = toUnits(j.p, mirror);
      return { id: j.id, label: `${hand} ${j.name}`, x: Math.round(x), y: Math.round(y), r: j.r };
    });
  }
  const body = Object.entries(views)
    .map(([k, list]) => `    "${k}": [\n${list.map((j) => `      ${JSON.stringify(j)}`).join(',\n')}\n    ]`)
    .join(',\n');
  return `{\n  "viewBox": { "width": ${W}, "height": ${H} },\n  "views": {\n${body}\n  }\n}\n`;
}

const root = new URL('../', import.meta.url);
writeFileSync(new URL('src/assets/hand-palmar.svg', root), handSvg('palmar'));
writeFileSync(new URL('src/assets/hand-dorsal.svg', root), handSvg('dorsal'));
console.log('Wrote src/assets/hand-palmar.svg and src/assets/hand-dorsal.svg');
if (process.argv.includes('--joints')) {
  console.warn('Overwriting src/data/joints.json: any hand-edited snap points are replaced.');
  writeFileSync(new URL('src/data/joints.json', root), jointsJson());
  console.log('Wrote src/data/joints.json');
}
