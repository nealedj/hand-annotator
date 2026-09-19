/**
 * Undo/redo over immutable snapshots.
 *
 * A gesture (dragging a mark, or tagging it in the popover) can change the state many
 * times; `begin()` and `end()` wrap it so it becomes a single undo step, and a gesture
 * that ends where it started (a mark placed then left untagged) adds no step at all.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private gestureStart: T | null = null;

  constructor(private current: T) {}

  get present(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.gestureStart === null && this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.gestureStart === null && this.future.length > 0;
  }

  get inGesture(): boolean {
    return this.gestureStart !== null;
  }

  commit(next: T): void {
    if (next === this.current) return;
    if (this.gestureStart === null) {
      this.past.push(this.current);
      this.future = [];
    }
    this.current = next;
  }

  begin(): void {
    if (this.gestureStart === null) this.gestureStart = this.current;
  }

  end(): void {
    const start = this.gestureStart;
    this.gestureStart = null;
    if (start === null || start === this.current) return;
    if (JSON.stringify(start) === JSON.stringify(this.current)) {
      this.current = start;
      return;
    }
    this.past.push(start);
    this.future = [];
  }

  undo(): void {
    if (!this.canUndo) return;
    this.future.push(this.current);
    this.current = this.past.pop()!;
  }

  redo(): void {
    if (!this.canRedo) return;
    this.past.push(this.current);
    this.current = this.future.pop()!;
  }

  /** Replaces everything, including history. Used by "Start new diagram". */
  reset(value: T): void {
    this.past = [];
    this.future = [];
    this.gestureStart = null;
    this.current = value;
  }
}
