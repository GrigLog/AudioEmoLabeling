/**
 * Snapshot-based undo/redo. Snapshots are expected to be immutable values, so
 * storing them is cheap (only references are kept).
 */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(
    private limit = 500,
    private coalesceMs = 1200,
  ) {}

  /**
   * Records `before` (the state prior to a change). Consecutive changes with the
   * same non-null `key` inside the coalescing window collapse into one step.
   */
  record(before: T, key: string | null = null, now = Date.now()): void {
    const coalesce = key !== null && key === this.lastKey && now - this.lastTime < this.coalesceMs;
    this.lastKey = key;
    this.lastTime = now;
    this.redoStack = [];
    if (coalesce) return;
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }

  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    this.lastKey = null;
    return prev;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    this.lastKey = null;
    return next;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = null;
  }
}
