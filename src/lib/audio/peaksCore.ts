import { decodeMono, fileReader, type WavInfo } from './wav';

export interface PeakChunk {
  startBin: number;
  min: Int16Array;
  max: Int16Array;
  /** Fraction of the file processed so far, 0..1. */
  progress: number;
}

/** Peak bins are 10 ms wide; finer zoom levels read raw samples instead. */
export function binSamplesFor(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / 100));
}

export function binCount(info: WavInfo, binSamples: number): number {
  return Math.ceil(info.frames / binSamples);
}

const CHUNK_BYTES = 8 * 1024 * 1024;

/** Streams the data chunk and emits min/max peaks (scaled to Int16) per bin. */
export async function computePeaks(
  file: Blob,
  info: WavInfo,
  binSamples: number,
  onChunk: (c: PeakChunk) => void,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const read = fileReader(file);
  const binBytes = binSamples * info.blockAlign;
  const chunkBins = Math.max(1, Math.floor(CHUNK_BYTES / binBytes));
  const total = binCount(info, binSamples);
  let mono: Float32Array = new Float32Array(chunkBins * binSamples);
  for (let startBin = 0; startBin < total; startBin += chunkBins) {
    if (isCancelled()) return;
    const bins = Math.min(chunkBins, total - startBin);
    const off = info.dataOffset + startBin * binBytes;
    const len = Math.min(bins * binBytes, info.dataOffset + info.dataSize - off);
    const buf = await read(off, len);
    mono = decodeMono(buf, info, mono);
    const frames = Math.floor(buf.byteLength / info.blockAlign);
    const min = new Int16Array(bins);
    const max = new Int16Array(bins);
    for (let b = 0; b < bins; b++) {
      const s0 = b * binSamples;
      const s1 = Math.min(frames, s0 + binSamples);
      let lo = 1;
      let hi = -1;
      for (let i = s0; i < s1; i++) {
        const v = mono[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (s1 <= s0) lo = hi = 0;
      min[b] = Math.max(-32768, Math.round(lo * 32767));
      max[b] = Math.min(32767, Math.round(hi * 32767));
    }
    onChunk({ startBin, min, max, progress: Math.min(1, (startBin + bins) / total) });
  }
}
