export const MAX_PX_PER_SEC = 8000;

/** Horizontal viewport of the timeline: which time range is visible and at what zoom. */
export class Viewport {
  start = 0;
  pxPerSec = 40;
  width = 1000;
  duration = 0;
  /** Bumped on every change so canvases know when to redraw. */
  version = 0;

  get visibleDur(): number {
    return this.width / this.pxPerSec;
  }

  get end(): number {
    return this.start + this.visibleDur;
  }

  get minPxPerSec(): number {
    return this.duration > 0 ? Math.min(MAX_PX_PER_SEC, this.width / this.duration) : 1;
  }

  private changed() {
    this.version++;
  }

  setDuration(d: number): void {
    this.duration = d;
    this.clamp();
    this.changed();
  }

  setWidth(w: number): void {
    if (w <= 0 || w === this.width) return;
    this.width = w;
    this.clamp();
    this.changed();
  }

  timeToX(t: number): number {
    return (t - this.start) * this.pxPerSec;
  }

  xToTime(x: number): number {
    return this.start + x / this.pxPerSec;
  }

  clamp(): void {
    this.pxPerSec = Math.max(this.minPxPerSec, Math.min(MAX_PX_PER_SEC, this.pxPerSec));
    const maxStart = Math.max(0, this.duration - this.visibleDur);
    this.start = Math.max(0, Math.min(maxStart, this.start));
  }

  /** Zooms by `factor`, keeping the time under pixel `x` fixed. */
  zoomAt(factor: number, x = this.width / 2): void {
    const t = this.xToTime(x);
    this.pxPerSec *= factor;
    this.pxPerSec = Math.max(this.minPxPerSec, Math.min(MAX_PX_PER_SEC, this.pxPerSec));
    this.start = t - x / this.pxPerSec;
    this.clamp();
    this.changed();
  }

  scrollBy(dx: number): void {
    this.start += dx / this.pxPerSec;
    this.clamp();
    this.changed();
  }

  scrollTo(start: number): void {
    this.start = start;
    this.clamp();
    this.changed();
  }

  set(start: number, pxPerSec: number): void {
    this.pxPerSec = pxPerSec;
    this.start = start;
    this.clamp();
    this.changed();
  }

  centerOn(t: number): void {
    this.scrollTo(t - this.visibleDur / 2);
  }

  /** Zooms so that [s, e] fills most of the view. */
  showRange(s: number, e: number): void {
    const dur = Math.max(0.2, e - s);
    this.pxPerSec = (this.width * 0.8) / dur;
    this.clamp();
    this.start = s - (this.visibleDur - dur) / 2;
    this.clamp();
    this.changed();
  }

  zoomAll(): void {
    this.set(0, this.minPxPerSec);
  }

  /** Pages the view when t leaves the comfortable zone. */
  ensureVisible(t: number, margin = 0.08): void {
    const v = this.visibleDur;
    if (t < this.start + v * 0.02 || t > this.start + v * (1 - margin)) {
      this.scrollTo(t - v * margin);
    }
  }

  /** Scrolls minimally so that [s, e] is visible (or its start, if it doesn't fit). */
  reveal(s: number, e: number): void {
    const v = this.visibleDur;
    if (s >= this.start && e <= this.end) return;
    if (e - s > v * 0.9 || s < this.start) this.scrollTo(s - v * 0.1);
    else this.scrollTo(e - v * 0.9);
  }
}
