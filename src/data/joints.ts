import data from './joints.json';
import { viewKey, type View, type ViewKey } from '../views';

/** A snap point, in the artwork's viewBox units. */
export interface Joint {
  id: string;
  /** Readable label including the hand, e.g. "Right index PIP". */
  label: string;
  x: number;
  y: number;
  /** Default mark radius. */
  r: number;
}

export const VIEWBOX: { readonly width: number; readonly height: number } = data.viewBox;

const byView = data.views as Record<ViewKey, Joint[]>;

export function jointsFor(view: View): readonly Joint[] {
  return byView[viewKey(view)];
}
