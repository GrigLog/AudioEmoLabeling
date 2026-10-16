/// <reference lib="webworker" />
import { computePeaks } from './peaksCore';
import type { WavInfo } from './wav';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<{ file: Blob; info: WavInfo; binSamples: number }>) => {
  const { file, info, binSamples } = e.data;
  try {
    await computePeaks(file, info, binSamples, (c) => {
      ctx.postMessage({ type: 'chunk', chunk: c }, [c.min.buffer, c.max.buffer]);
    });
    ctx.postMessage({ type: 'done' });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
