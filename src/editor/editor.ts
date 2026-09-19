import { jointsFor, VIEWBOX } from '../data/joints';
import type { PlacedCallout } from '../layout/callouts';
import { History } from '../model/history';
import { ISSUES, type IssueType } from '../model/issues';
import {
  displayRadius,
  emptySession,
  GENERAL_NOTES_MAX,
  nextId,
  reduce,
  RING_WIDTH,
  sameView,
  type Action,
  type Mark,
  type Pin,
  type Session,
  type Target,
} from '../model/session';
import { nearestJoint, placeAt } from '../model/snap';
import { handArtwork, viewLabelText } from '../render/artwork';
import { markDescription, markPlace } from '../render/marks';
import { measureText } from '../render/measure';
import { PIN_RADIUS, pinDescription } from '../render/notes';
import { renderScene } from '../render/scene';
import { svg } from '../render/svg';
import { viewKey, viewLabel, VIEWS, type Hand, type Side, type View } from '../views';
import { el } from './dom';
import { Popover, privateField, type PopoverContent } from './popover';

/** Pointer travel, in screen pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 5;

type Tool = 'mark' | 'pin';

type Gesture =
  | { kind: 'press'; target: Target; callout: boolean; pointerId: number; clientX: number; clientY: number; start: DOMPoint }
  | { kind: 'drag-item'; target: Target; pointerId: number; grabDx: number; grabDy: number }
  | { kind: 'drag-callout'; target: Target; pointerId: number; start: DOMPoint; centre: { x: number; y: number }; anchor: { x: number; y: number } }
  | { kind: 'resize'; id: string; pointerId: number }
  | { kind: 'press-empty'; pointerId: number; clientX: number; clientY: number; closedPopover: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function mountEditor(root: HTMLElement): void {
  const history = new History<Session>(emptySession());
  let exported: Session = history.present; // what the last export contained (milestone 5)
  let view: View = { hand: 'right', side: 'palmar' };
  let tool: Tool = 'mark';
  let snapOn = true;
  let selected: Target | null = null;
  let lastType: IssueType = 'pain';
  let gesture: Gesture | null = null;
  let placedCallouts: PlacedCallout[] = [];

  const session = () => history.present;
  const findMark = (id: string | undefined | null) => session().marks.find((m) => m.id === id);
  const findPin = (id: string | undefined | null) => session().pins.find((p) => p.id === id);
  const find = (t: Target | null): Mark | Pin | undefined => (t?.kind === 'mark' ? findMark(t.id) : t ? findPin(t.id) : undefined);
  const itemsIn = (v: View) => session().marks.filter((m) => sameView(m.view, v)).length + session().pins.filter((p) => sameView(p.view, v)).length;
  const hasContent = (s: Session) => s.marks.length > 0 || s.pins.length > 0 || s.generalNotes.trim() !== '';
  const sameTarget = (a: Target | null, b: Target | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;
  const parseKey = (key: string): Target => {
    const [kind, id] = key.split(':') as ['mark' | 'pin', string];
    return { kind, id };
  };

  function apply(action: Action) {
    history.commit(reduce(session(), action));
  }

  // ---- Layout -----------------------------------------------------------------------

  const status = el('p', { className: 'sr-only', role: 'status' });
  const announce = (text: string) => {
    status.textContent = '';
    requestAnimationFrame(() => (status.textContent = text));
  };

  const segment = (label: string, onClick: () => void) => {
    const badge = el('span', { className: 'badge', ariaHidden: 'true' });
    const button = el('button', { type: 'button', className: 'segment', onclick: onClick }, [label, badge]);
    return { button, badge };
  };
  const handButtons: Record<Hand, ReturnType<typeof segment>> = {
    left: segment('Left', () => setView({ ...view, hand: 'left' })),
    right: segment('Right', () => setView({ ...view, hand: 'right' })),
  };
  const sideButtons: Record<Side, ReturnType<typeof segment>> = {
    palmar: segment('Palmar', () => setView({ ...view, side: 'palmar' })),
    dorsal: segment('Dorsal', () => setView({ ...view, side: 'dorsal' })),
  };

  const downloadButton = el('button', {
    type: 'button',
    className: 'button primary',
    disabled: true,
    title: 'PNG export arrives in milestone 5',
  }, ['Download PNG']);
  const newButton = el('button', { type: 'button', className: 'button', onclick: startNew }, ['Start new diagram']);

  const toolButton = (t: Tool, label: string) =>
    el('button', { type: 'button', className: 'tool', onclick: () => setTool(t) }, [label]);
  const markTool = toolButton('mark', 'Mark');
  const pinTool = toolButton('pin', 'Pin note');
  const snapToggle = el('button', {
    type: 'button',
    className: 'tool',
    title: 'Snap marks to joints. Hold Alt to place a free mark near a joint.',
    onclick: () => {
      snapOn = !snapOn;
      render();
    },
  }, ['Snap to joints']);
  const undoButton = el('button', { type: 'button', className: 'tool', onclick: undo }, ['Undo']);
  const redoButton = el('button', { type: 'button', className: 'tool', onclick: redo }, ['Redo']);

  const diagram = svg('svg', {
    class: 'diagram',
    viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
    role: 'group',
    tabindex: 0,
  });
  const artworkLayer = svg('g');
  const snapLayer = svg('g', { class: 'snap-dots', 'aria-hidden': 'true' });
  const sceneLayer = svg('g', { class: 'scene' });
  const overlayLayer = svg('g', { class: 'overlay' });
  diagram.append(
    svg('rect', { width: VIEWBOX.width, height: VIEWBOX.height, fill: '#ffffff' }),
    artworkLayer,
    snapLayer,
    sceneLayer,
    overlayLayer,
  );

  const diagramWrap = el('div', { className: 'diagram-wrap' }, [diagram]);
  const popover = new Popover(diagramWrap, {
    onToggle: toggleType,
    onNote: (text) => {
      if (!popover.target) return;
      apply({ type: 'setNote', target: popover.target, text });
      render();
    },
    onDelete: () => popover.target && deleteItem(popover.target),
    onClose: () => closePopover(),
  });

  const viewList = el('ul', { className: 'view-list' });
  const legend = el(
    'ul',
    { className: 'legend' },
    ISSUES.map((i) =>
      el('li', {}, [
        el('span', { className: `swatch swatch-${i.id}`, ariaHidden: 'true' }),
        el('span', { className: 'legend-code' }, [i.code]),
        el('span', {}, [i.name]),
      ]),
    ),
  );

  const generalNotes = el('textarea', {
    id: 'general-notes',
    className: 'note-field general-notes',
    rows: 8,
    maxLength: GENERAL_NOTES_MAX,
    // Typing in one sitting is one undo step.
    onfocus: () => history.begin(),
    onblur: () => {
      history.end();
      renderChrome();
    },
    oninput: () => {
      apply({ type: 'setGeneralNotes', text: generalNotes.value });
      renderChrome();
    },
  });
  privateField(generalNotes);
  const generalCounter = el('span', { className: 'counter', id: 'general-notes-count' });
  generalNotes.setAttribute('aria-describedby', 'general-notes-count');

  root.append(
    el('header', { className: 'topbar' }, [
      el('h1', { className: 'app-title' }, ['Hand Map']),
      el('div', { className: 'selectors' }, [
        el('div', { className: 'segmented', role: 'group', ariaLabel: 'Hand' }, [
          handButtons.left.button,
          handButtons.right.button,
        ]),
        el('div', { className: 'segmented', role: 'group', ariaLabel: 'View' }, [
          sideButtons.palmar.button,
          sideButtons.dorsal.button,
        ]),
      ]),
      el('div', { className: 'topbar-actions' }, [downloadButton, newButton]),
    ]),
    el('div', { className: 'toolbar', role: 'toolbar', ariaLabel: 'Tools' }, [markTool, pinTool, snapToggle, undoButton, redoButton]),
    el('main', { className: 'workspace' }, [
      diagramWrap,
      el('aside', { className: 'side-panel' }, [
        el('section', {}, [el('h2', {}, ['Views in this diagram']), viewList]),
        el('section', {}, [el('h2', {}, ['Issue types']), legend]),
        el('section', {}, [
          el('div', { className: 'field-head' }, [
            el('label', { htmlFor: 'general-notes' }, [el('h2', {}, ['General notes'])]),
            generalCounter,
          ]),
          generalNotes,
        ]),
      ]),
    ]),
    status,
  );

  // ---- Rendering --------------------------------------------------------------------

  let renderedView: string | null = null;

  function renderArtwork() {
    const key = viewKey(view);
    if (renderedView === key) return;
    renderedView = key;
    artworkLayer.replaceChildren(handArtwork(view), viewLabelText(view));
    snapLayer.replaceChildren(
      ...jointsFor(view).map((j) => svg('circle', { cx: j.x, cy: j.y, r: 7, class: 'snap-dot' })),
    );
  }

  /** Marks, pins and callouts from the shared scene renderer, made interactive. */
  function renderSceneLayer() {
    const focused = (document.activeElement as Element | null)?.closest?.('[data-mark-id],[data-pin-id]');
    const focusSel = focused
      ? focused.hasAttribute('data-mark-id')
        ? `[data-mark-id="${focused.getAttribute('data-mark-id')}"]`
        : `[data-pin-id="${focused.getAttribute('data-pin-id')}"]`
      : null;

    const scene = renderScene(session(), view, measureText);
    placedCallouts = scene.placed;
    for (const g of Array.from(scene.marks.querySelectorAll<SVGGElement>('[data-mark-id]'))) {
      const m = findMark(g.dataset.markId)!;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', markDescription(m) + (m.note?.text ? `. Note: ${m.note.text}` : ''));
      // An invisible disc makes the whole mark, not just its ring, easy to grab.
      g.prepend(svg('circle', { cx: m.x, cy: m.y, r: displayRadius(m) + RING_WIDTH / 2, class: 'mark-hit' }));
      if (sameTarget(selected, { kind: 'mark', id: m.id })) g.classList.add('is-selected');
    }
    for (const g of Array.from(scene.pins.querySelectorAll<SVGGElement>('[data-pin-id]'))) {
      const p = findPin(g.dataset.pinId)!;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', pinDescription(p));
      g.prepend(svg('circle', { cx: p.x, cy: p.y, r: PIN_RADIUS + 14, class: 'mark-hit' }));
    }
    sceneLayer.replaceChildren(...scene.layers);
    if (focusSel) sceneLayer.querySelector<SVGGElement>(focusSel)?.focus({ preventScroll: true });
  }

  function renderOverlay() {
    overlayLayer.replaceChildren();
    const item = find(selected);
    if (!item || !sameView(item.view, view)) return;
    if (selected!.kind === 'pin') {
      overlayLayer.append(svg('circle', { cx: item.x, cy: item.y, r: PIN_RADIUS + 10, class: 'selection-ring' }));
      return;
    }
    const m = item as Mark;
    const outer = displayRadius(m) + RING_WIDTH / 2;
    const a = Math.PI / 4;
    const hx = m.x + outer * Math.cos(a);
    const hy = m.y + outer * Math.sin(a);
    overlayLayer.append(
      svg('circle', { cx: m.x, cy: m.y, r: outer + 8, class: 'selection-ring' }),
      svg('g', { class: 'resize-handle', 'data-handle': m.id }, [
        svg('circle', { cx: hx, cy: hy, r: 26, class: 'handle-hit' }),
        svg('circle', { cx: hx, cy: hy, r: 11, class: 'handle-dot' }),
      ]),
    );
  }

  function renderChrome() {
    for (const hand of ['left', 'right'] as const) {
      const n = itemsIn({ hand, side: 'palmar' }) + itemsIn({ hand, side: 'dorsal' });
      const b = handButtons[hand];
      b.button.ariaPressed = String(view.hand === hand);
      b.badge.textContent = n ? String(n) : '';
      b.button.setAttribute('aria-label', `${hand === 'left' ? 'Left' : 'Right'} hand${n ? `, ${plural(n, 'item', 'items')}` : ''}`);
    }
    for (const side of ['palmar', 'dorsal'] as const) {
      const n = itemsIn({ hand: view.hand, side });
      const b = sideButtons[side];
      b.button.ariaPressed = String(view.side === side);
      b.badge.textContent = n ? String(n) : '';
      b.button.setAttribute('aria-label', `${side === 'palmar' ? 'Palmar' : 'Dorsal'}${n ? `, ${plural(n, 'item', 'items')}` : ''}`);
    }
    viewList.replaceChildren(
      ...VIEWS.map((v) => {
        const n = itemsIn(v);
        return el('li', {}, [
          el('button', {
            type: 'button',
            className: 'view-link',
            ariaCurrent: sameView(v, view) ? 'true' : null,
            onclick: () => setView(v),
          }, [el('span', {}, [viewLabel(v)]), el('span', { className: n ? 'badge' : 'badge empty' }, [String(n)])]),
        ]);
      }),
    );
    markTool.ariaPressed = String(tool === 'mark');
    pinTool.ariaPressed = String(tool === 'pin');
    snapToggle.ariaPressed = String(snapOn);
    undoButton.disabled = !history.canUndo && !history.inGesture;
    redoButton.disabled = !history.canRedo;
    diagramWrap.classList.toggle('snap-off', !snapOn || tool !== 'mark');
    diagramWrap.dataset.tool = tool;
    if (document.activeElement !== generalNotes && generalNotes.value !== session().generalNotes) {
      generalNotes.value = session().generalNotes;
    }
    generalCounter.textContent = `${session().generalNotes.length} / ${GENERAL_NOTES_MAX}`;
    diagram.setAttribute(
      'aria-label',
      `${viewLabel(view)} diagram. ${tool === 'mark' ? 'Click a joint or the hand to place a mark.' : 'Click anywhere to drop a pin note.'}`,
    );
  }

  function popoverContent(t: Target): PopoverContent | null {
    if (t.kind === 'mark') {
      const m = findMark(t.id);
      return m ? { title: markPlace(m), types: m.types, note: m.note?.text ?? '' } : null;
    }
    const p = findPin(t.id);
    return p ? { title: `Pin note, ${viewLabel(p.view).toLowerCase()}`, note: p.note.text } : null;
  }

  /** The screen rectangle of a mark or pin, for placing the popover beside it. */
  function anchorRect(t: Target): DOMRect {
    const item = find(t)!;
    const reach = t.kind === 'mark' ? displayRadius(item as Mark) + RING_WIDTH : PIN_RADIUS + 8;
    const ctm = diagram.getScreenCTM()!;
    const a = new DOMPoint(item.x - reach, item.y - reach).matrixTransform(ctm);
    const b = new DOMPoint(item.x + reach, item.y + reach).matrixTransform(ctm);
    return new DOMRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  function render() {
    renderArtwork();
    renderSceneLayer();
    renderOverlay();
    renderChrome();
    if (popover.target) {
      const c = popoverContent(popover.target);
      if (c) popover.update(c, anchorRect(popover.target));
    }
  }

  // ---- Actions ----------------------------------------------------------------------

  function setView(v: View) {
    if (popover.isOpen) closePopover({ restoreFocus: false });
    view = v;
    const item = find(selected);
    if (item && !sameView(item.view, v)) selected = null;
    render();
  }

  function setTool(t: Tool) {
    if (popover.isOpen) closePopover({ restoreFocus: false });
    tool = t;
    render();
  }

  function openPopover(t: Target) {
    const content = popoverContent(t);
    if (!content) return;
    history.begin();
    selected = t;
    render();
    popover.open(t, content, anchorRect(t));
  }

  function closePopover({ restoreFocus = true } = {}) {
    const t = popover.target;
    if (!t) return;
    popover.close();
    const item = find(t);
    // A mark with no types, or a pin with no note, isn't worth keeping.
    if (item && t.kind === 'mark' && (item as Mark).types.length === 0) {
      apply({ type: 'deleteMark', id: t.id });
      selected = null;
    } else if (item && t.kind === 'pin' && (item as Pin).note.text.trim() === '') {
      apply({ type: 'deletePin', id: t.id });
      selected = null;
    }
    history.end();
    render();
    if (restoreFocus) {
      const sel = t.kind === 'mark' ? `[data-mark-id="${t.id}"]` : `[data-pin-id="${t.id}"]`;
      (sceneLayer.querySelector<SVGGElement>(sel) ?? diagram).focus({ preventScroll: true });
    }
  }

  function toggleType(t: IssueType) {
    const m = popover.target?.kind === 'mark' ? findMark(popover.target.id) : undefined;
    if (!m) return;
    const on = !m.types.includes(t);
    apply({ type: 'setMarkTypes', id: m.id, types: on ? [...m.types, t] : m.types.filter((x) => x !== t) });
    if (on) lastType = t;
    render();
  }

  function placeMark(x: number, y: number, snap: boolean) {
    const p = placeAt(jointsFor(view), x, y, { snap });
    const mark: Mark = { id: nextId('m'), view, ...p, types: [lastType] };
    history.begin(); // placing, tagging and noting is one undo step
    apply({ type: 'addMark', mark });
    announce(`Mark placed: ${markPlace(mark)}`);
    openPopover({ kind: 'mark', id: mark.id });
  }

  function placePin(x: number, y: number) {
    const pin: Pin = { id: nextId('p'), view, x, y, note: { text: '' } };
    history.begin();
    apply({ type: 'addPin', pin });
    announce('Pin dropped');
    openPopover({ kind: 'pin', id: pin.id });
  }

  function deleteItem(t: Target) {
    const item = find(t);
    if (!item) return;
    const inPopover = popover.isFor(t);
    apply(t.kind === 'mark' ? { type: 'deleteMark', id: t.id } : { type: 'deletePin', id: t.id });
    if (sameTarget(selected, t)) selected = null;
    if (inPopover) closePopover({ restoreFocus: false });
    announce(t.kind === 'mark' ? `Mark deleted: ${markPlace(item as Mark)}` : 'Pin deleted');
    render();
    diagram.focus({ preventScroll: true });
  }

  function undo() {
    if (popover.isOpen) closePopover({ restoreFocus: false });
    if (!history.canUndo) return;
    history.undo();
    if (!find(selected)) selected = null;
    announce('Undone');
    render();
  }

  function redo() {
    if (popover.isOpen) closePopover({ restoreFocus: false });
    if (!history.canRedo) return;
    history.redo();
    if (!find(selected)) selected = null;
    announce('Redone');
    render();
  }

  function startNew() {
    const ok =
      !hasContent(session()) ||
      window.confirm('Start a new diagram? All marks and notes will be cleared. This cannot be undone.');
    if (!ok) return;
    resetAll();
    announce('New diagram started');
  }

  function resetAll() {
    popover.close();
    gesture = null;
    history.reset(emptySession());
    exported = history.present;
    selected = null;
    lastType = 'pain';
    snapOn = true;
    tool = 'mark';
    view = { hand: 'right', side: 'palmar' };
    generalNotes.value = '';
    render();
  }

  // ---- Pointer input ----------------------------------------------------------------

  const toArtwork = (e: { clientX: number; clientY: number }) =>
    new DOMPoint(e.clientX, e.clientY).matrixTransform(diagram.getScreenCTM()!.inverse());

  /** Whether an artwork point is on the drawn hand (the fills are in right-hand coordinates). */
  function onHand(x: number, y: number): boolean {
    const pt = diagram.createSVGPoint();
    pt.x = view.hand === 'left' ? VIEWBOX.width - x : x;
    pt.y = y;
    return Array.from(artworkLayer.querySelectorAll<SVGGeometryElement>('.hand-fill path')).some((p) => p.isPointInFill(pt));
  }

  const dragged = (e: PointerEvent, g: { clientX: number; clientY: number }) =>
    Math.hypot(e.clientX - g.clientX, e.clientY - g.clientY) >= DRAG_THRESHOLD;

  diagram.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || gesture) return;
    // Finish a general-notes edit first, so it stays a separate undo step.
    if (document.activeElement === generalNotes) generalNotes.blur();
    const el = e.target as Element;
    const handle = el.closest('[data-handle]');
    const markEl = el.closest<SVGGElement>('[data-mark-id]');
    const pinEl = el.closest<SVGGElement>('[data-pin-id]');
    const calloutEl = el.closest('[data-callout]');
    const start = toArtwork(e);

    if (handle) {
      if (popover.isOpen) closePopover({ restoreFocus: false });
      history.begin();
      gesture = { kind: 'resize', id: handle.getAttribute('data-handle')!, pointerId: e.pointerId };
    } else if (markEl || pinEl || calloutEl) {
      const target: Target = markEl
        ? { kind: 'mark', id: markEl.dataset.markId! }
        : pinEl
          ? { kind: 'pin', id: pinEl.dataset.pinId! }
          : parseKey(calloutEl!.getAttribute('data-callout')!);
      gesture = { kind: 'press', target, callout: !markEl && !pinEl, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, start };
    } else {
      gesture = { kind: 'press-empty', pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, closedPopover: popover.isOpen };
      if (popover.isOpen) closePopover({ restoreFocus: false });
      return;
    }
    diagram.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  diagram.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const p = toArtwork(e);
    if (gesture.kind === 'press') {
      if (!dragged(e, gesture)) return;
      const g = gesture;
      if (popover.isOpen) closePopover({ restoreFocus: false });
      const item = find(g.target);
      if (!item) return;
      history.begin();
      if (g.callout) {
        const placed = placedCallouts.find((c) => c.key === `${g.target.kind}:${g.target.id}`)!;
        gesture = {
          kind: 'drag-callout',
          target: g.target,
          pointerId: g.pointerId,
          start: g.start,
          centre: { x: placed.box.x + placed.box.w / 2, y: placed.box.y + placed.box.h / 2 },
          anchor: { x: item.x, y: item.y },
        };
      } else {
        selected = g.target;
        gesture = { kind: 'drag-item', target: g.target, pointerId: g.pointerId, grabDx: g.start.x - item.x, grabDy: g.start.y - item.y };
      }
    }
    switch (gesture.kind) {
      case 'drag-item': {
        const x = p.x - gesture.grabDx;
        const y = p.y - gesture.grabDy;
        // While dragging a mark is free; it snaps (or not) when dropped.
        apply(gesture.target.kind === 'mark' ? { type: 'moveMark', id: gesture.target.id, x, y } : { type: 'movePin', id: gesture.target.id, x, y });
        render();
        break;
      }
      case 'drag-callout': {
        const g = gesture;
        const cx = g.centre.x + (p.x - g.start.x);
        const cy = g.centre.y + (p.y - g.start.y);
        apply({ type: 'moveCallout', target: g.target, dx: Math.round(cx - g.anchor.x), dy: Math.round(cy - g.anchor.y) });
        render();
        break;
      }
      case 'resize': {
        const m = findMark(gesture.id);
        if (m) apply({ type: 'resizeMark', id: m.id, r: Math.hypot(p.x - m.x, p.y - m.y) - RING_WIDTH / 2 });
        render();
        break;
      }
    }
  });

  diagram.addEventListener('pointerup', (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const g = gesture;
    gesture = null;
    const p = toArtwork(e);
    const snap = snapOn && !e.altKey;

    switch (g.kind) {
      case 'press':
        if (popover.isFor(g.target)) closePopover();
        else {
          if (popover.isOpen) closePopover({ restoreFocus: false });
          openPopover(g.target);
        }
        break;
      case 'drag-item': {
        if (g.target.kind === 'mark') {
          const m = findMark(g.target.id)!;
          const joint = snap ? nearestJoint(jointsFor(view), m.x, m.y) : null;
          if (joint) apply({ type: 'moveMark', id: m.id, x: joint.x, y: joint.y, r: joint.r, jointId: joint.id });
          else apply({ type: 'moveMark', id: m.id, x: m.x, y: m.y });
          announce(`Mark moved: ${markPlace(findMark(g.target.id)!)}`);
        }
        history.end();
        render();
        break;
      }
      case 'drag-callout':
      case 'resize':
        history.end();
        render();
        break;
      case 'press-empty': {
        if (g.closedPopover || dragged(e, g)) break; // a click away only closes the popover
        if (tool === 'pin') placePin(p.x, p.y);
        else if (onHand(p.x, p.y)) placeMark(p.x, p.y, snap);
        else if (selected) {
          selected = null;
          render();
        }
        break;
      }
    }
  });

  diagram.addEventListener('pointercancel', () => {
    if (gesture && gesture.kind !== 'press' && gesture.kind !== 'press-empty') history.end();
    gesture = null;
    render();
  });

  // ---- Keyboard ---------------------------------------------------------------------

  const targetOf = (node: EventTarget | null): Target | null => {
    const item = (node as Element | null)?.closest?.('[data-mark-id],[data-pin-id]');
    if (!item) return null;
    const markId = item.getAttribute('data-mark-id');
    return markId ? { kind: 'mark', id: markId } : { kind: 'pin', id: item.getAttribute('data-pin-id')! };
  };

  diagram.addEventListener('keydown', (e) => {
    const t = targetOf(e.target);
    if (t && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation(); // the document handler would otherwise close it again
      openPopover(t);
    }
  });
  diagram.addEventListener('focusin', (e) => {
    const t = targetOf(e.target);
    if (t && !sameTarget(t, selected) && !popover.isOpen) {
      selected = t;
      renderOverlay();
    }
  });

  document.addEventListener('keydown', (e) => {
    const inPopover = popover.element.contains(e.target as Node);
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) redo();
      else undo();
      return;
    }
    if (popover.isOpen && (e.key === 'Escape' || (e.key === 'Enter' && (inPopover || !typing)))) {
      e.preventDefault();
      closePopover();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !typing) {
      e.preventDefault();
      deleteItem(selected);
      return;
    }
    if (e.key === 'Escape' && selected) {
      selected = null;
      render();
    }
  });

  // Click away: pressing anywhere outside the popover and the diagram closes it.
  document.addEventListener('pointerdown', (e) => {
    if (!popover.isOpen) return;
    const t = e.target as Node;
    if (popover.element.contains(t) || diagram.contains(t)) return;
    closePopover({ restoreFocus: false });
  });

  // ---- Privacy and safety nets -------------------------------------------------------

  // "Leave site?" prompt when there's unexported work. A safety net, not persistence.
  window.addEventListener('beforeunload', (e) => {
    if (hasContent(session()) && session() !== exported) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  // Browsers can restore form fields and whole pages (back-forward cache, session
  // restore). Clear every field as the page goes away, and start blank if it comes back.
  window.addEventListener('pagehide', () => {
    for (const f of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))) {
      f.value = '';
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resetAll();
  });

  render();
}
