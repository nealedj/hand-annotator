import { ISSUES, type IssueType } from '../model/issues';
import { displayRadius, RING_WIDTH, type Mark } from '../model/session';
import { el } from './dom';

interface Handlers {
  onToggle: (t: IssueType) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * The popover beside a mark: eight issue-type toggle chips, Delete and Done.
 * On narrow screens CSS turns it into a bottom sheet.
 */
export class Popover {
  readonly element: HTMLDivElement;
  markId: string | null = null;
  private readonly heading: HTMLHeadingElement;
  private readonly chips = new Map<IssueType, HTMLButtonElement>();

  constructor(private readonly container: HTMLElement, handlers: Handlers) {
    this.heading = el('h2', { className: 'popover-title', id: 'popover-title' });
    const chipList = el(
      'div',
      { className: 'chips', role: 'group', ariaLabel: 'Issue types' },
      ISSUES.map((i) => {
        const chip = el(
          'button',
          { type: 'button', className: 'chip', ariaPressed: 'false', onclick: () => handlers.onToggle(i.id) },
          [
            el('span', { className: `swatch swatch-${i.id}`, ariaHidden: 'true' }),
            el('span', { className: 'chip-code', ariaHidden: 'true' }, [i.code]),
            el('span', { className: 'chip-name' }, [i.name]),
          ],
        );
        this.chips.set(i.id, chip);
        return chip;
      }),
    );
    this.element = el(
      'div',
      { className: 'popover', role: 'dialog', hidden: true },
      [
        this.heading,
        el('p', { className: 'popover-hint' }, ['Choose one or more issue types. Enter or Done to finish.']),
        chipList,
        el('div', { className: 'popover-actions' }, [
          el('button', { type: 'button', className: 'button danger', onclick: handlers.onDelete }, ['Delete mark']),
          el('button', { type: 'button', className: 'button primary', onclick: handlers.onClose }, ['Done']),
        ]),
      ],
    );
    this.element.setAttribute('aria-labelledby', 'popover-title');
    container.append(this.element);
  }

  get isOpen(): boolean {
    return this.markId !== null;
  }

  open(mark: Mark, place: string, diagram: SVGSVGElement): void {
    this.markId = mark.id;
    this.element.hidden = false;
    this.update(mark, place, diagram);
    const first = mark.types[0];
    (first ? this.chips.get(first) : this.chips.values().next().value)?.focus({ preventScroll: true });
  }

  update(mark: Mark, place: string, diagram: SVGSVGElement): void {
    this.heading.textContent = place;
    for (const [t, chip] of this.chips) chip.ariaPressed = String(mark.types.includes(t));
    this.position(mark, diagram);
  }

  close(): void {
    this.markId = null;
    this.element.hidden = true;
  }

  /** Beside the mark, on whichever side has room, kept inside the diagram area. */
  private position(mark: Mark, diagram: SVGSVGElement): void {
    const ctm = diagram.getScreenCTM();
    if (!ctm) return;
    const box = this.container.getBoundingClientRect();
    const reach = displayRadius(mark) + RING_WIDTH;
    const right = new DOMPoint(mark.x + reach, mark.y).matrixTransform(ctm);
    const left = new DOMPoint(mark.x - reach, mark.y).matrixTransform(ctm);
    const w = this.element.offsetWidth;
    const h = this.element.offsetHeight;
    const gap = 12;
    let x = right.x - box.left + gap;
    if (x + w > box.width - 8) x = left.x - box.left - gap - w;
    x = Math.max(8, Math.min(x, box.width - w - 8));
    const y = Math.max(8, Math.min(right.y - box.top - h / 2, box.height - h - 8));
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }
}
