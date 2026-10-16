export interface WavInfo {
  sampleFormat: 'int' | 'float';
  bitsPerSample: number;
  channels: number;
  sampleRate: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
  frames: number;
  duration: number;
}

export type ByteReader = (offset: number, length: number) => Promise<ArrayBuffer>;

export function fileReader(file: Blob): ByteReader {
  return (offset, length) => file.slice(offset, offset + length).arrayBuffer();
}

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

function fourcc(v: DataView, at: number): string {
  return String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
}

/** Parses a RIFF/WAVE header by walking its chunks until the data chunk. */
export async function readWavInfo(read: ByteReader, fileSize: number): Promise<WavInfo> {
  const head = new DataView(await read(0, Math.min(fileSize, 12)));
  if (head.byteLength < 12 || fourcc(head, 0) !== 'RIFF' || fourcc(head, 8) !== 'WAVE') {
    throw new Error('Not a WAV file (missing RIFF/WAVE header).');
  }
  let fmt: Omit<WavInfo, 'dataOffset' | 'dataSize' | 'frames' | 'duration'> | null = null;
  let pos = 12;
  while (pos + 8 <= fileSize) {
    const h = new DataView(await read(pos, 8));
    const id = fourcc(h, 0);
    const size = h.getUint32(4, true);
    const body = pos + 8;
    if (id === 'fmt ') {
      const f = new DataView(await read(body, Math.min(size, 40)));
      let tag = f.getUint16(0, true);
      const channels = f.getUint16(2, true);
      const sampleRate = f.getUint32(4, true);
      const blockAlign = f.getUint16(12, true);
      const bitsPerSample = f.getUint16(14, true);
      if (tag === WAVE_FORMAT_EXTENSIBLE && f.byteLength >= 26) tag = f.getUint16(24, true);
      if (tag !== WAVE_FORMAT_PCM && tag !== WAVE_FORMAT_IEEE_FLOAT) {
        throw new Error(`Unsupported WAV encoding (format tag ${tag}). Use PCM or float WAV.`);
      }
      const sampleFormat = tag === WAVE_FORMAT_IEEE_FLOAT ? 'float' : 'int';
      if (sampleFormat === 'int' && ![8, 16, 24, 32].includes(bitsPerSample)) throw new Error(`Unsupported bit depth: ${bitsPerSample}.`);
      if (sampleFormat === 'float' && bitsPerSample !== 32) throw new Error(`Unsupported float bit depth: ${bitsPerSample}.`);
      if (!channels || !sampleRate) throw new Error('Corrupt WAV format chunk.');
      fmt = { sampleFormat, bitsPerSample, channels, sampleRate, blockAlign: blockAlign || (channels * bitsPerSample) / 8 };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk appears before the format chunk.');
      // Streaming writers sometimes leave the size as 0 or 0xFFFFFFFF; trust the file size then.
      const available = fileSize - body;
      const dataSize = size === 0 || size === 0xffffffff || size > available ? available : size;
      const frames = Math.floor(dataSize / fmt.blockAlign);
      return { ...fmt, dataOffset: body, dataSize: frames * fmt.blockAlign, frames, duration: frames / fmt.sampleRate };
    }
    pos = body + size + (size & 1);
  }
  throw new Error('WAV file has no data chunk.');
}

/**
 * Decodes interleaved frames into mono floats in [-1, 1] (channels are averaged).
 * `bytes` must start on a frame boundary.
 */
export function decodeMono(bytes: ArrayBuffer, info: WavInfo, out?: Float32Array): Float32Array {
  const { channels, bitsPerSample, sampleFormat, blockAlign } = info;
  const frames = Math.floor(bytes.byteLength / blockAlign);
  const res = out && out.length >= frames ? out : new Float32Array(frames);
  const inv = 1 / channels;
  if (sampleFormat === 'int' && bitsPerSample === 16) {
    const a = new Int16Array(bytes, 0, frames * channels);
    if (channels === 1) {
      for (let i = 0; i < frames; i++) res[i] = a[i] / 32768;
    } else {
      for (let i = 0, j = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += a[j++];
        res[i] = (s * inv) / 32768;
      }
    }
    return res;
  }
  if (sampleFormat === 'float') {
    const a = new Float32Array(bytes, 0, frames * channels);
    for (let i = 0, j = 0; i < frames; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += a[j++];
      res[i] = s * inv;
    }
    return res;
  }
  const v = new DataView(bytes);
  const bps = bitsPerSample / 8;
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) {
      const at = i * blockAlign + c * bps;
      if (bitsPerSample === 8) s += (v.getUint8(at) - 128) / 128;
      else if (bitsPerSample === 24) {
        const x = v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16);
        s += x / 8388608;
      } else s += v.getInt32(at, true) / 2147483648;
    }
    res[i] = s * inv;
  }
  return res;
}
