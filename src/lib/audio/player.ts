/**
 * Thin wrapper around <audio>: streaming playback from a Blob URL (no full decode),
 * pitch-preserving speed, and range playback that stops or loops at span edges.
 */
export class Player {
  readonly el: HTMLAudioElement;
  private url: string | null = null;
  private range: { start: number; end: number; loop: boolean } | null = null;
  private lastMediaTime = 0;
  private lastStamp = 0;
  private pendingSeek: number | null = null;
  onStateChange: (playing: boolean) => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor() {
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.preservesPitch = true;
    this.el.addEventListener('play', () => this.onStateChange(true));
    this.el.addEventListener('pause', () => this.onStateChange(false));
    this.el.addEventListener('ended', () => this.onStateChange(false));
    this.el.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek !== null) {
        this.el.currentTime = this.pendingSeek;
        this.pendingSeek = null;
      }
    });
    this.el.addEventListener('error', () => {
      const err = this.el.error;
      if (err && this.url) this.onError(`Audio playback error (${err.code}): ${err.message || 'the browser cannot play this file'}`);
    });
  }

  load(file: Blob): void {
    this.unload();
    this.url = URL.createObjectURL(file);
    this.el.src = this.url;
    this.el.load();
  }

  unload(): void {
    this.el.pause();
    this.range = null;
    this.pendingSeek = null;
    if (this.url) {
      this.el.removeAttribute('src');
      this.el.load();
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
  }

  get playing(): boolean {
    return !this.el.paused && !this.el.ended;
  }

  get rate(): number {
    return this.el.playbackRate;
  }

  set rate(r: number) {
    this.el.playbackRate = r;
  }

  get rangeEnd(): number | null {
    return this.range?.end ?? null;
  }

  get looping(): boolean {
    return !!this.range?.loop;
  }

  /** Smoothed current time: interpolates between the element's coarse time updates. */
  time(): number {
    if (this.pendingSeek !== null) return this.pendingSeek;
    const t = this.el.currentTime;
    const now = performance.now();
    if (!this.playing) {
      this.lastMediaTime = t;
      this.lastStamp = now;
      return t;
    }
    if (t !== this.lastMediaTime) {
      this.lastMediaTime = t;
      this.lastStamp = now;
      return t;
    }
    const est = t + ((now - this.lastStamp) / 1000) * this.el.playbackRate;
    return Math.min(est, t + 0.25);
  }

  async play(): Promise<void> {
    try {
      await this.el.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      this.onError(e instanceof Error ? e.message : String(e));
    }
  }

  pause(): void {
    this.el.pause();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else {
      // Resuming outside the active range drops it.
      if (this.range && (this.el.currentTime < this.range.start - 0.01 || this.el.currentTime >= this.range.end - 0.01)) this.range = null;
      void this.play();
    }
  }

  seek(t: number): void {
    const d = Number.isFinite(this.el.duration) ? this.el.duration : Infinity;
    t = Math.max(0, Math.min(d, t));
    if (this.el.readyState < 1) this.pendingSeek = t;
    this.el.currentTime = t;
    this.lastMediaTime = this.el.currentTime;
    this.lastStamp = performance.now();
    if (this.range && (t < this.range.start - 0.01 || t > this.range.end)) this.range = null;
  }

  playRange(start: number, end: number, loop = false): void {
    this.range = { start, end, loop };
    this.seek(start);
    void this.play();
  }

  clearRange(): void {
    this.range = null;
  }

  setLoop(loop: boolean): void {
    if (this.range) this.range.loop = loop;
  }

  /** Called every animation frame; enforces range end. */
  tick(): void {
    if (!this.range || !this.playing) return;
    if (this.el.currentTime >= this.range.end) {
      if (this.range.loop) this.seek(this.range.start);
      else {
        this.pause();
        this.el.currentTime = this.range.end;
        this.range = null;
      }
    }
  }
}
