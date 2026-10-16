import { describe, expect, it } from 'vitest';
import { binCount, binSamplesFor, computePeaks, type PeakChunk } from '../src/lib/audio/peaksCore';
import { fileReader, readWavInfo } from '../src/lib/audio/wav';
import { PeakData } from '../src/lib/audio/peaks';
import { makeWav } from './wavfixture';

describe('peaks', () => {
  it('computes per-bin min/max and builds a consistent pyramid', async () => {
    const sr = 8000;
    const n = sr * 30; // 30 s -> 3000 bins
    const s = Array.from({ length: n }, (_, i) => Math.sin(i / 10) * (i < n / 2 ? 0.2 : 0.8));
    const blob = new Blob([makeWav({ sampleRate: sr, samples: [s] })]);
    const info = await readWavInfo(fileReader(blob), blob.size);
    const binSamples = binSamplesFor(sr);
    expect(binSamples).toBe(80);
    const bins = binCount(info, binSamples);
    const pd = new PeakData(sr, binSamples, bins);
    const chunks: PeakChunk[] = [];
    await computePeaks(blob, info, binSamples, (c) => {
      chunks.push(c);
      pd.addChunk(c);
    });
    pd.finish();
    expect(chunks.at(-1)!.progress).toBe(1);
    expect(pd.loadedBins).toBe(bins);
    const { min, max } = pd.base;
    // First half is quiet, second half loud.
    expect(max[10] / 32767).toBeCloseTo(0.2, 1);
    expect(max[bins - 10] / 32767).toBeCloseTo(0.8, 1);
    expect(min[bins - 10] / 32767).toBeCloseTo(-0.8, 1);
    expect(pd.levels.length).toBeGreaterThan(1);

    // Zoomed-out columns must match a brute-force aggregation of the base level.
    const cols = 37;
    const spp = info.duration / cols;
    const lo = new Float32Array(cols);
    const hi = new Float32Array(cols);
    pd.fillColumns(0, spp, cols, lo, hi);
    const c = 30;
    const b0 = Math.floor((c * spp) / pd.binDur);
    const b1 = Math.floor(((c + 1) * spp) / pd.binDur);
    let bh = -1;
    for (let b = b0; b < b1; b++) bh = Math.max(bh, max[b] / 32767);
    expect(Math.abs(hi[c] - bh)).toBeLessThan(0.02);
    expect(pd.gain).toBeGreaterThanOrEqual(1);
  });

  it('marks columns beyond the loaded part as NaN while loading', () => {
    const pd = new PeakData(16000, 160, 1000);
    pd.addChunk({ startBin: 0, min: new Int16Array(100).fill(-100), max: new Int16Array(100).fill(100), progress: 0.1 });
    const lo = new Float32Array(10);
    const hi = new Float32Array(10);
    pd.fillColumns(0, 0.5, 10, lo, hi); // 0.5 s per column = 50 bins
    expect(Number.isNaN(hi[0])).toBe(false);
    expect(Number.isNaN(hi[5])).toBe(true);
  });
});
