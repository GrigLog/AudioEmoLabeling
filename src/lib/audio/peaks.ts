import { binCount, binSamplesFor, computePeaks, type PeakChunk } from './peaksCore';
import { decodeMono, type WavInfo } from './wav';
import PeaksWorker from './peaks.worker?worker&inline';

interface Level {
  factor: number;
  min: Int16Array;
  max: Int16Array;
}

const LEVEL_FACTOR = 4;

/** Multi-resolution min/max peaks for the whole recording. */
export class PeakData {
  readonly binDur: number;
  readonly levels: Level[];
  loadedBins = 0;
  complete = false;
  /** Display gain that makes the loud parts fill ~90% of the height. */
  gain = 1;
  private hist = new Float64Array(256);

  constructor(
    readonly sampleRate: number,
    readonly binSamples: number,
    readonly bins: number,
    min?: Int16Array,
    max?: Int16Array,
  ) {
    this.binDur = binSamples / sampleRate;
    this.levels = [{ factor: 1, min: min ?? new Int16Array(bins), max: max ?? new Int16Array(bins) }];
    if (min && max) {
      this.loadedBins = bins;
      for (let i = 0; i < bins; i++) this.histAdd(min[i], max[i]);
      this.finish();
    }
  }

  private histAdd(lo: number, hi: number) {
    const a = Math.max(-lo, hi);
    this.hist[Math.min(255, a >> 7)]++;
  }

  addChunk(c: PeakChunk): void {
    const base = this.levels[0];
    base.min.set(c.min, c.startBin);
    base.max.set(c.max, c.startBin);
    for (let i = 0; i < c.min.length; i++) this.histAdd(c.min[i], c.max[i]);
    this.loadedBins = Math.max(this.loadedBins, c.startBin + c.min.length);
    this.updateGain();
  }

  private updateGain() {
    let total = 0;
    for (const v of this.hist) total += v;
    if (!total) return;
    let acc = 0;
    let bucket = 255;
    for (let i = 255; i >= 0; i--) {
      acc += this.hist[i];
      if (acc >= total * 0.002) {
        bucket = i;
        break;
      }
    }
    const p = ((bucket + 1) * 128) / 32768;
    this.gain = Math.max(1, Math.min(30, 0.9 / Math.max(p, 1e-4)));
  }

  finish(): void {
    this.levels.length = 1;
    let prev = this.levels[0];
    while (prev.min.length > 512) {
      const n = Math.ceil(prev.min.length / LEVEL_FACTOR);
      const min = new Int16Array(n);
      const max = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        let lo = 32767;
        let hi = -32768;
        const end = Math.min(prev.min.length, (i + 1) * LEVEL_FACTOR);
        for (let j = i * LEVEL_FACTOR; j < end; j++) {
          if (prev.min[j] < lo) lo = prev.min[j];
          if (prev.max[j] > hi) hi = prev.max[j];
        }
        min[i] = lo;
        max[i] = hi;
      }
      const lvl = { factor: prev.factor * LEVEL_FACTOR, min, max };
      this.levels.push(lvl);
      prev = lvl;
    }
    this.complete = true;
    this.loadedBins = this.bins;
    this.updateGain();
  }

  /**
   * Fills per-column min/max in [-1, 1] for columns starting at t0, each `spp` seconds wide.
   * Columns not loaded yet get NaN.
   */
  fillColumns(t0: number, spp: number, n: number, outMin: Float32Array, outMax: Float32Array): void {
    let level = this.levels[0];
    if (this.complete) {
      for (const l of this.levels) if (l.factor * this.binDur <= spp) level = l;
    }
    const lvlDur = level.factor * this.binDur;
    const len = level.min.length;
    const loaded = Math.ceil(this.loadedBins / level.factor);
    for (let c = 0; c < n; c++) {
      const ta = t0 + c * spp;
      let b0 = Math.floor(ta / lvlDur);
      let b1 = Math.floor((ta + spp) / lvlDur);
      if (b1 <= b0) b1 = b0 + 1;
      if (b0 < 0) b0 = 0;
      if (b1 > len) b1 = len;
      if (b0 >= b1 || b0 >= loaded) {
        outMin[c] = NaN;
        outMax[c] = NaN;
        continue;
      }
      let lo = 32767;
      let hi = -32768;
      for (let b = b0; b < b1; b++) {
        if (level.min[b] < lo) lo = level.min[b];
        if (level.max[b] > hi) hi = level.max[b];
      }
      outMin[c] = lo / 32767;
      outMax[c] = hi / 32767;
    }
  }

  get base(): { min: Int16Array; max: Int16Array } {
    return this.levels[0];
  }
}

export interface PeakJob {
  peaks: PeakData;
  done: Promise<void>;
  cancel(): void;
}

/** Computes peaks in a worker (falls back to the main thread when workers are unavailable). */
export function startPeaks(file: Blob, info: WavInfo, onProgress: (fraction: number) => void): PeakJob {
  const binSamples = binSamplesFor(info.sampleRate);
  const peaks = new PeakData(info.sampleRate, binSamples, binCount(info, binSamples));
  let cancelled = false;
  let worker: Worker | null = null;

  const onChunk = (c: PeakChunk) => {
    peaks.addChunk(c);
    onProgress(c.progress);
  };

  const mainThread = () =>
    computePeaks(
      file,
      info,
      binSamples,
      onChunk,
      () => cancelled,
    );

  const done = new Promise<void>((resolve, reject) => {
    const fallback = () => {
      worker?.terminate();
      worker = null;
      mainThread().then(resolve, reject);
    };
    try {
      worker = new PeaksWorker();
    } catch {
      fallback();
      return;
    }
    let started = false;
    worker.onmessage = (e: MessageEvent) => {
      started = true;
      const m = e.data;
      if (m.type === 'chunk') onChunk(m.chunk as PeakChunk);
      else if (m.type === 'done') {
        worker?.terminate();
        resolve();
      } else if (m.type === 'error') {
        worker?.terminate();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      if (!started) fallback();
      else reject(new Error(e.message || 'Waveform worker failed.'));
    };
    worker.postMessage({ file, info, binSamples });
  }).then(() => {
    if (!cancelled) peaks.finish();
  });

  return {
    peaks,
    done,
    cancel() {
      cancelled = true;
      worker?.terminate();
    },
  };
}

const RAW_CHUNK = 32768;
const RAW_CACHE_CHUNKS = 64;

/** Reads raw samples on demand for deep zoom, with a small LRU cache. */
export class RawCache {
  private chunks = new Map<number, Float32Array>();
  private pending = new Set<number>();

  constructor(
    private file: Blob,
    private info: WavInfo,
    private onLoad: () => void,
  ) {}

  private chunk(i: number): Float32Array | null {
    const c = this.chunks.get(i);
    if (c) {
      this.chunks.delete(i);
      this.chunks.set(i, c);
      return c;
    }
    if (!this.pending.has(i)) {
      this.pending.add(i);
      const { blockAlign, dataOffset, frames } = this.info;
      const f0 = i * RAW_CHUNK;
      const n = Math.min(RAW_CHUNK, frames - f0);
      const off = dataOffset + f0 * blockAlign;
      this.file
        .slice(off, off + n * blockAlign)
        .arrayBuffer()
        .then((buf) => {
          this.pending.delete(i);
          this.chunks.set(i, decodeMono(buf, this.info));
          while (this.chunks.size > RAW_CACHE_CHUNKS) this.chunks.delete(this.chunks.keys().next().value!);
          this.onLoad();
        })
        .catch(() => this.pending.delete(i));
    }
    return null;
  }

  private sample(f: number): number | null {
    if (f < 0 || f >= this.info.frames) return 0;
    const c = this.chunk(Math.floor(f / RAW_CHUNK));
    return c ? c[f % RAW_CHUNK] : null;
  }

  /** Like PeakData.fillColumns, from raw samples. Returns false if data is still loading. */
  fillColumns(t0: number, spp: number, n: number, outMin: Float32Array, outMax: Float32Array): boolean {
    const sr = this.info.sampleRate;
    const fStart = Math.floor(t0 * sr) - 1;
    const fEnd = Math.ceil((t0 + n * spp) * sr) + 1;
    // Make sure all required chunks are requested in one go.
    let ready = true;
    for (let ci = Math.floor(Math.max(0, fStart) / RAW_CHUNK); ci <= Math.floor(Math.max(0, fEnd) / RAW_CHUNK); ci++) {
      if (ci * RAW_CHUNK >= this.info.frames) break;
      if (!this.chunk(ci)) ready = false;
    }
    if (!ready) return false;
    let prev = NaN;
    for (let c = 0; c < n; c++) {
      const ta = (t0 + c * spp) * sr;
      const tb = (t0 + (c + 1) * spp) * sr;
      let f0 = Math.ceil(ta);
      const f1 = Math.ceil(tb);
      let lo = Infinity;
      let hi = -Infinity;
      let last = NaN;
      for (; f0 < f1; f0++) {
        const v = this.sample(f0) ?? 0;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        last = v;
      }
      if (lo === Infinity) {
        // Zoomed in past one sample per column: interpolate between neighbours.
        const fa = Math.floor(ta);
        const a = this.sample(fa) ?? 0;
        const b = this.sample(fa + 1) ?? 0;
        lo = hi = last = a + (b - a) * (ta - fa);
      }
      // Connect to the previous column so the trace reads as a continuous line.
      if (!Number.isNaN(prev)) {
        lo = Math.min(lo, prev);
        hi = Math.max(hi, prev);
      }
      prev = last;
      outMin[c] = lo;
      outMax[c] = hi;
    }
    return true;
  }
}
