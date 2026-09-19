export type IssueType =
  | 'pain'
  | 'oedema'
  | 'stiffness'
  | 'sensation'
  | 'deformity'
  | 'weakness'
  | 'scar'
  | 'triggering';

export interface IssueInfo {
  id: IssueType;
  /** Letter code drawn on marks. */
  code: string;
  /** Full name, shown in the popover and legend. */
  name: string;
  /** Short name for screen-reader labels, e.g. "Right index PIP: pain, swelling". */
  spoken: string;
  /** Okabe–Ito colour-blind-safe palette. */
  colour: string;
}

/** The fixed list, in table order. Multi-type marks draw segments and codes in this order. */
export const ISSUES: readonly IssueInfo[] = [
  { id: 'pain', code: 'P', name: 'Pain', spoken: 'pain', colour: '#D55E00' },
  { id: 'oedema', code: 'O', name: 'Swelling / oedema', spoken: 'swelling', colour: '#0072B2' },
  { id: 'stiffness', code: 'S', name: 'Stiffness / reduced range of motion', spoken: 'stiffness', colour: '#E69F00' },
  { id: 'sensation', code: 'N', name: 'Altered sensation (numbness, tingling)', spoken: 'altered sensation', colour: '#CC79A7' },
  { id: 'deformity', code: 'D', name: 'Deformity (e.g. swan neck, boutonnière, ulnar drift)', spoken: 'deformity', colour: '#000000' },
  { id: 'weakness', code: 'W', name: 'Weakness / reduced grip', spoken: 'weakness', colour: '#56B4E9' },
  { id: 'scar', code: 'Sc', name: 'Wound or scar', spoken: 'wound or scar', colour: '#009E73' },
  { id: 'triggering', code: 'T', name: 'Triggering / clicking / locking', spoken: 'triggering', colour: '#F0E442' },
];

const byId = new Map(ISSUES.map((i) => [i.id, i]));

export const issueInfo = (t: IssueType): IssueInfo => byId.get(t)!;

/** Types in table order, without duplicates. */
export const inTableOrder = (types: readonly IssueType[]): IssueType[] =>
  ISSUES.filter((i) => types.includes(i.id)).map((i) => i.id);
