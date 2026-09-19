import { jointsFor, VIEWBOX } from '../data/joints';
import { History } from '../model/history';
import { ISSUES, type IssueType } from '../model/issues';
import {
  displayRadius,
  emptySession,
  nextId,
  reduce,
  RING_WIDTH,
  sameView,
  type Action,
  type Mark,
  type Session,
} from '../model/session';
import { nearestJoint, placeAt } from '../model/snap';
import { handArtwork, viewLabelText } from '../render/artwork';
import { markDescription, markPlace, renderMarks } from '../render/marks';
import { svg } from '../render/svg';
import { viewKey, viewLabel, VIEWS, type Hand, type Side, type View } from '../views';
import { el } from './dom';
import { Popover } from './popover';

/** Pointer travel, in screen pixels, before a press on a mark becomes a drag. */
const DRAG_THRESHOLD = 5;

type Gesture =
  | { kind: 'press-mark'; id: string; pointerId: number; clientX: number; clientY: number; grabDx: number; grabDy: number }
  | { kind: 'drag'; id: string; pointerId: number; grabDx: number; grabDy: number }
  | { kind: 'resize'; id: string; pointerId: number }
  | { kind: 'press-empty'; pointerId: number; clientX: number; clientY: number; closedPopover: boolean };

export function mountEditor(root: HTMLElement): void {
  const history = new History<Session>(emptySession());
  let exported: Session = history.present; // what the last export contained (M5)
  let view: View = { hand: 'right', side: 'palmar' };
  let snapOn = true;
  let selectedId: string | null = null;
  let lastType: IssueType = 'pain';
  let gesture: Gesture | null = null;

  const session = () => history.present;
  const findMark = (id: string | null) => session().marks.find((m) => m.id === id);
  const marksIn = (v: View) => session().marks.filter((m) => sameView(m.view, v));
  const hasContent = (s: Session) => s.marks.length > 0 || s.pins.length > 0 || s.generalNotes.trim() !== '';

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
    const badge = el('span', { className: 'badge' });
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

  const markTool = el('button', { type: 'button', className: 'tool', ariaPressed: 'true' }, ['Mark']);
  const snapToggle = el('button', {
    type: 'button',
    className: 'tool',
    ariaPressed: 'true',
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
  });
  const artworkLayer = svg('g');
  const snapLayer = svg('g', { class: 'snap-dots', 'aria-hidden': 'true' });
  let marksLayer = svg('g', { class: 'marks' });
  const overlayLayer = svg('g', { class: 'overlay' });
  diagram.append(
    svg('rect', { width: VIEWBOX.width, height: VIEWBOX.height, fill: '#ffffff' }),
    artworkLayer,
    snapLayer,
    marksLayer,
    overlayLayer,
  );

  const diagramWrap = el('div', { className: 'diagram-wrap' }, [diagram]);
  const popover = new Popover(diagramWrap, {
    onToggle: toggleType,
    onDelete: () => deleteMark(popover.markId!),
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
    el('div', { className: 'toolbar', role: 'toolbar', ariaLabel: 'Tools' }, [markTool, snapToggle, undoButton, redoButton]),
    el('main', { className: 'workspace' }, [
      diagramWrap,
      el('aside', { className: 'side-panel' }, [
        el('section', {}, [el('h2', {}, ['Views in this diagram']), viewList]),
        el('section', {}, [el('h2', {}, ['Issue types']), legend]),
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
    diagram.setAttribute('aria-label', `${viewLabel(view)} diagram. Click a joint or the hand to place a mark.`);
  }

  function renderMarksLayer() {
    const focusedId = (document.activeElement as Element | null)?.closest?.('[data-mark-id]')?.getAttribute('data-mark-id');
    const layer = renderMarks(marksIn(view));
    for (const g of Array.from(layer.querySelectorAll<SVGGElement>('[data-mark-id]'))) {
      const m = findMark(g.dataset.markId!)!;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', markDescription(m));
      // An invisible disc makes the whole mark, not just its ring, easy to grab.
      g.prepend(svg('circle', { cx: m.x, cy: m.y, r: displayRadius(m) + RING_WIDTH / 2, class: 'mark-hit' }));
      if (m.id === selectedId) g.classList.add('is-selected');
    }
    marksLayer.replaceWith(layer);
    marksLayer = layer;
    if (focusedId) layer.querySelector<SVGGElement>(`[data-mark-id="${focusedId}"]`)?.focus();
  }

  function renderOverlay() {
    overlayLayer.replaceChildren();
    const m = findMark(selectedId);
    if (!m || !sameView(m.view, view)) return;
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
    const count = (v: View) => marksIn(v).length;
    for (const hand of ['left', 'right'] as const) {
      const n = count({ hand, side: 'palmar' }) + count({ hand, side: 'dorsal' });
      handButtons[hand].button.ariaPressed = String(view.hand === hand);
      handButtons[hand].badge.textContent = n ? String(n) : '';
      handButtons[hand].button.setAttribute('aria-label', `${hand === 'left' ? 'Left' : 'Right'} hand${n ? `, ${n} marks` : ''}`);
    }
    for (const side of ['palmar', 'dorsal'] as const) {
      const n = count({ hand: view.hand, side });
      sideButtons[side].button.ariaPressed = String(view.side === side);
      sideButtons[side].badge.textContent = n ? String(n) : '';
      sideButtons[side].button.setAttribute('aria-label', `${side === 'palmar' ? 'Palmar' : 'Dorsal'}${n ? `, ${n} marks` : ''}`);
    }
    viewList.replaceChildren(
      ...VIEWS.map((v) => {
        const n = count(v);
        return el('li', {}, [
          el('button', {
            type: 'button',
            className: 'view-link',
            ariaCurrent: sameView(v, view) ? 'true' : null,
            onclick: () => setView(v),
          }, [
            el('span', {}, [viewLabel(v)]),
            el('span', { className: n ? 'badge' : 'badge empty' }, [n ? `${n}` : '0']),
          ]),
        ]);
      }),
    );
    snapToggle.ariaPressed = String(snapOn);
    undoButton.disabled = !history.canUndo && !history.inGesture;
    redoButton.disabled = !history.canRedo;
    diagramWrap.classList.toggle('snap-off', !snapOn);
  }

  function render() {
    renderArtwork();
    renderMarksLayer();
    renderOverlay();
    renderChrome();
    const m = findMark(popover.markId);
    if (m) popover.update(m, markPlace(m), diagram);
  }

  // ---- Actions ----------------------------------------------------------------------

  function setView(v: View) {
    if (popover.isOpen) closePopover();
    view = v;
    const sel = findMark(selectedId);
    if (sel && !sameView(sel.view, v)) selectedId = null;
    render();
  }

  function openPopover(id: string) {
    const m = findMark(id);
    if (!m) return;
    history.begin();
    selectedId = id;
    popover.open(m, markPlace(m), diagram);
    render();
  }

  function closePopover({ restoreFocus = true } = {}) {
    const id = popover.markId;
    if (id === null) return;
    popover.close();
    const m = findMark(id);
    if (m && m.types.length === 0) {
      apply({ type: 'deleteMark', id });
      selectedId = null;
    }
    history.end();
    render();
    if (restoreFocus) {
      const target = marksLayer.querySelector<SVGGElement>(`[data-mark-id="${id}"]`);
      (target ?? diagram).focus({ preventScroll: true });
    }
  }

  function toggleType(t: IssueType) {
    const m = findMark(popover.markId);
    if (!m) return;
    const on = !m.types.includes(t);
    apply({ type: 'setMarkTypes', id: m.id, types: on ? [...m.types, t] : m.types.filter((x) => x !== t) });
    if (on) lastType = t;
    render();
  }

  function placeMark(x: number, y: number, snap: boolean) {
    const p = placeAt(jointsFor(view), x, y, { snap });
    const mark: Mark = { id: nextId('m'), view, ...p, types: [lastType] };
    history.begin(); // placing and tagging is one undo step
    apply({ type: 'addMark', mark });
    announce(`Mark placed: ${markPlace(mark)}`);
    openPopover(mark.id);
  }

  function deleteMark(id: string) {
    const m = findMark(id);
    if (!m) return;
    const wasPopover = popover.markId === id;
    apply({ type: 'deleteMark', id });
    if (selectedId === id) selectedId = null;
    if (wasPopover) closePopover({ restoreFocus: false });
    announce(`Mark deleted: ${markPlace(m)}`);
    render();
    diagram.focus({ preventScroll: true });
  }

  function undo() {
    if (popover.isOpen) closePopover({ restoreFocus: false });
    if (!history.canUndo) return;
    history.undo();
    if (!findMark(selectedId)) selectedId = null;
    announce('Undone');
    render();
  }

  function redo() {
    if (popover.isOpen) closePopover({ restoreFocus: false });
    if (!history.canRedo) return;
    history.redo();
    if (!findMark(selectedId)) selectedId = null;
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
    selectedId = null;
    lastType = 'pain';
    snapOn = true;
    view = { hand: 'right', side: 'palmar' };
    render();
  }

  // ---- Pointer input ----------------------------------------------------------------

  function toArtwork(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(diagram.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }

  /** Whether an artwork point is on the drawn hand (the fills are in right-hand coordinates). */
  function onHand(x: number, y: number): boolean {
    const pt = diagram.createSVGPoint();
    pt.x = view.hand === 'left' ? VIEWBOX.width - x : x;
    pt.y = y;
    return Array.from(artworkLayer.querySelectorAll<SVGGeometryElement>('.hand-fill path')).some((p) => p.isPointInFill(pt));
  }

  diagram.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || gesture) return;
    const target = e.target as Element;
    const handle = target.closest('[data-handle]');
    const markEl = target.closest<SVGGElement>('[data-mark-id]');
    const p = toArtwork(e);

    if (handle) {
      const id = handle.getAttribute('data-handle')!;
      if (popover.isOpen) closePopover({ restoreFocus: false });
      history.begin();
      gesture = { kind: 'resize', id, pointerId: e.pointerId };
      diagram.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (markEl) {
      const m = findMark(markEl.dataset.markId!)!;
      gesture = {
        kind: 'press-mark',
        id: m.id,
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        grabDx: p.x - m.x,
        grabDy: p.y - m.y,
      };
      diagram.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    gesture = { kind: 'press-empty', pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, closedPopover: popover.isOpen };
    if (popover.isOpen) closePopover({ restoreFocus: false });
  });

  diagram.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const p = toArtwork(e);
    if (gesture.kind === 'press-mark') {
      if (Math.hypot(e.clientX - gesture.clientX, e.clientY - gesture.clientY) < DRAG_THRESHOLD) return;
      if (popover.isOpen) closePopover({ restoreFocus: false });
      history.begin();
      selectedId = gesture.id;
      gesture = { kind: 'drag', id: gesture.id, pointerId: gesture.pointerId, grabDx: gesture.grabDx, grabDy: gesture.grabDy };
    }
    if (gesture.kind === 'drag') {
      // While dragging the mark is free; it snaps (or not) when dropped.
      apply({ type: 'moveMark', id: gesture.id, x: p.x - gesture.grabDx, y: p.y - gesture.grabDy });
      render();
    } else if (gesture.kind === 'resize') {
      const m = findMark(gesture.id);
      if (m) apply({ type: 'resizeMark', id: m.id, r: Math.hypot(p.x - m.x, p.y - m.y) - RING_WIDTH / 2 });
      render();
    }
  });

  diagram.addEventListener('pointerup', (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const g = gesture;
    gesture = null;
    const p = toArtwork(e);
    const snap = snapOn && !e.altKey;

    switch (g.kind) {
      case 'press-mark':
        if (popover.markId === g.id) closePopover();
        else {
          if (popover.isOpen) closePopover({ restoreFocus: false });
          openPopover(g.id);
        }
        break;
      case 'drag': {
        const m = findMark(g.id)!;
        const joint = snap ? nearestJoint(jointsFor(view), m.x, m.y) : null;
        if (joint) apply({ type: 'moveMark', id: m.id, x: joint.x, y: joint.y, r: joint.r, jointId: joint.id });
        else apply({ type: 'moveMark', id: m.id, x: m.x, y: m.y });
        history.end();
        announce(`Mark moved: ${markPlace(findMark(g.id)!)}`);
        render();
        break;
      }
      case 'resize':
        history.end();
        render();
        break;
      case 'press-empty': {
        const moved = Math.hypot(e.clientX - g.clientX, e.clientY - g.clientY) >= DRAG_THRESHOLD;
        if (g.closedPopover || moved) break; // a click away only closes the popover
        if (onHand(p.x, p.y)) placeMark(p.x, p.y, snap);
        else if (selectedId) {
          selectedId = null;
          render();
        }
        break;
      }
    }
  });

  diagram.addEventListener('pointercancel', () => {
    if (gesture && (gesture.kind === 'drag' || gesture.kind === 'resize')) history.end();
    gesture = null;
    render();
  });

  // ---- Keyboard ---------------------------------------------------------------------

  diagram.addEventListener('keydown', (e) => {
    const markEl = (e.target as Element).closest<SVGGElement>('[data-mark-id]');
    if (markEl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation(); // the document handler would otherwise close it again
      openPopover(markEl.dataset.markId!);
    }
  });
  diagram.addEventListener('focusin', (e) => {
    const id = (e.target as Element).closest?.('[data-mark-id]')?.getAttribute('data-mark-id');
    if (id && id !== selectedId && !popover.isOpen) {
      selectedId = id;
      renderOverlay();
      for (const g of Array.from(marksLayer.querySelectorAll('[data-mark-id]'))) {
        g.classList.toggle('is-selected', g.getAttribute('data-mark-id') === id);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      redo();
      return;
    }
    if (popover.isOpen && (e.key === 'Escape' || (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)))) {
      e.preventDefault();
      closePopover();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !typing) {
      e.preventDefault();
      deleteMark(selectedId);
      return;
    }
    if (e.key === 'Escape' && selectedId) {
      selectedId = null;
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

  diagram.setAttribute('tabindex', '0');
  render();
}
