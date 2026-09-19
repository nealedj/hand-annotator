import { ISSUES, type IssueType } from '../model/issues';
import { NOTE_MAX, type Target } from '../model/session';
import { el } from './dom';

interface Handlers {
  onToggle: (t: IssueType) => void;
  onNote: (text: string) => void;
  onResize: (delta: number) => void;
  onMove: () => void;
  onResetCallout: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export interface PopoverContent {
  title: string;
  /** Issue types, for a mark. Pins have none. */
  types?: readonly IssueType[];
  note: string;
  /** Whether the note's callout has been dragged (so it can be put back automatically). */
  calloutMoved?: boolean;
}

/** Attributes that keep typed text out of autofill, spellcheck services and extensions. */
export function privateField(f: HTMLInputElement | HTMLTextAreaElement): void {
  f.autocomplete = 'off';
  f.spellcheck = false; // enhanced spellcheck can send text to a cloud service
  f.setAttribute('autocapitalize', 'sentences');
  f.setAttribute('autocorrect', 'off');
  f.setAttribute('data-gramm', 'false');
  f.setAttribute('data-gramm_editor', 'false');
  f.setAttribute('data-enable-grammarly', 'false');
}

/**
 * The popover beside a mark or pin: issue-type chips (marks only), an optional note,
 * Delete and Done. On narrow screens CSS turns it into a bottom sheet.
 */
export class Popover {
  readonly element: HTMLDivElement;
  target: Target | null = null;
  private readonly heading: HTMLHeadingElement;
  private readonly chipGroup: HTMLDivElement;
  private readonly hint: HTMLParagraphElement;
  private readonly chips = new Map<IssueType, HTMLButtonElement>();
  private readonly noteLabel: HTMLLabelElement;
  private readonly note: HTMLTextAreaElement;
  private readonly counter: HTMLSpanElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly moveButton: HTMLButtonElement;
  private readonly sizeGroup: HTMLDivElement;
  private readonly resetButton: HTMLButtonElement;

  constructor(private readonly container: HTMLElement, handlers: Handlers) {
    this.heading = el('h2', { className: 'popover-title', id: 'popover-title' });
    this.hint = el('p', { className: 'popover-hint' });
    this.chipGroup = el(
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

    this.note = el('textarea', {
      id: 'popover-note',
      className: 'note-field',
      rows: 3,
      maxLength: NOTE_MAX,
      oninput: () => {
        // Pinned notes are one paragraph; Enter finishes the popover instead.
        const clean = this.note.value.replace(/\n/g, ' ');
        if (clean !== this.note.value) this.note.value = clean;
        this.updateCounter();
        handlers.onNote(this.note.value);
      },
    });
    privateField(this.note);
    this.counter = el('span', { className: 'counter', id: 'popover-note-count' });
    this.note.setAttribute('aria-describedby', 'popover-note-count');
    this.noteLabel = el('label', { htmlFor: 'popover-note', className: 'field-label' });

    this.deleteButton = el('button', { type: 'button', className: 'button danger', onclick: handlers.onDelete });
    // Alternatives to dragging (WCAG 2.5.7): size buttons, tap-to-move, and resetting a
    // dragged callout.
    this.sizeGroup = el('div', { className: 'size-group', role: 'group', ariaLabel: 'Mark size' }, [
      el('span', { className: 'field-label', ariaHidden: 'true' }, ['Size']),
      el('button', { type: 'button', className: 'button compact', ariaLabel: 'Make mark smaller', onclick: () => handlers.onResize(-8) }, ['−']),
      el('button', { type: 'button', className: 'button compact', ariaLabel: 'Make mark larger', onclick: () => handlers.onResize(8) }, ['+']),
    ]);
    this.moveButton = el('button', { type: 'button', className: 'button', onclick: handlers.onMove }, ['Move']);
    this.resetButton = el('button', { type: 'button', className: 'button', onclick: handlers.onResetCallout }, ['Reset note position']);
    this.element = el('div', { className: 'popover', role: 'dialog', hidden: true }, [
      this.heading,
      this.hint,
      this.chipGroup,
      el('div', { className: 'note-block' }, [
        el('div', { className: 'field-head' }, [this.noteLabel, this.counter]),
        this.note,
      ]),
      el('div', { className: 'popover-tools' }, [this.sizeGroup, this.moveButton, this.resetButton]),
      el('div', { className: 'popover-actions' }, [
        this.deleteButton,
        el('button', { type: 'button', className: 'button primary', onclick: handlers.onClose }, ['Done']),
      ]),
    ]);
    this.element.setAttribute('aria-labelledby', 'popover-title');
    container.append(this.element);
  }

  get isOpen(): boolean {
    return this.target !== null;
  }

  isFor(t: Target | null): boolean {
    return !!t && !!this.target && t.kind === this.target.kind && t.id === this.target.id;
  }

  open(target: Target, content: PopoverContent, anchor: DOMRect): void {
    this.target = target;
    const isMark = target.kind === 'mark';
    this.chipGroup.hidden = !isMark;
    this.hint.textContent = isMark
      ? 'Choose one or more issue types. Enter or Done to finish.'
      : 'Type the note for this pin. Enter or Done to finish.';
    this.noteLabel.textContent = isMark ? 'Note (optional)' : 'Note';
    this.deleteButton.textContent = isMark ? 'Delete mark' : 'Delete pin';
    this.sizeGroup.hidden = !isMark;
    this.moveButton.ariaLabel = isMark ? 'Move mark: then tap or click its new place' : 'Move pin: then tap or click its new place';
    this.note.value = content.note;
    this.updateCounter();
    this.element.hidden = false;
    this.update(content, anchor);
    if (isMark) {
      const first = content.types?.[0];
      (first ? this.chips.get(first) : this.chips.values().next().value)?.focus({ preventScroll: true });
    } else {
      this.note.focus({ preventScroll: true });
    }
  }

  /** Refreshes the title, chip states and position. Leaves the note alone while it's being typed. */
  update(content: PopoverContent, anchor: DOMRect): void {
    this.heading.textContent = content.title;
    for (const [t, chip] of this.chips) chip.ariaPressed = String(!!content.types?.includes(t));
    this.resetButton.hidden = !content.calloutMoved;
    this.position(anchor);
  }

  close(): void {
    this.target = null;
    this.note.value = '';
    this.element.hidden = true;
  }

  private updateCounter(): void {
    this.counter.textContent = `${this.note.value.length} / ${NOTE_MAX}`;
  }

  /** Beside the anchor (screen rectangle), on whichever side has room, inside the diagram area. */
  private position(anchor: DOMRect): void {
    const box = this.container.getBoundingClientRect();
    const w = this.element.offsetWidth;
    const h = this.element.offsetHeight;
    const gap = 12;
    let x = anchor.right - box.left + gap;
    if (x + w > box.width - 8) x = anchor.left - box.left - gap - w;
    x = Math.max(8, Math.min(x, box.width - w - 8));
    const cy = anchor.top + anchor.height / 2 - box.top;
    const y = Math.max(8, Math.min(cy - h / 2, box.height - h - 8));
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }
}
