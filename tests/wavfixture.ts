/** Builds small WAV files in memory for tests. */
export function makeWav(opts: {
  sampleRate?: number;
  channels?: number;
  bits?: 8 | 16 | 24 | 32;
  float?: boolean;
  extensible?: boolean;
  extraChunk?: boolean;
  zeroDataSize?: boolean;
  samples: number[][]; // [channel][frame] in [-1, 1]
}): Uint8Array<ArrayBuffer> {
  const sr = opts.sampleRate ?? 16000;
  const ch = opts.channels ?? opts.samples.length;
  const bits = opts.bits ?? 16;
  const bps = bits / 8;
  const frames = opts.samples[0].length;
  const dataSize = frames * ch * bps;
  const fmtSize = opts.extensible ? 40 : 16;
  const extra = opts.extraChunk ? 8 + 26 : 0; // odd-sized LIST chunk + pad byte
  const total = 12 + 8 + fmtSize + extra + 8 + dataSize;
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);
  let p = 0;
  const str = (s: string) => {
    for (const c of s) v.setUint8(p++, c.charCodeAt(0));
  };
  str('RIFF');
  v.setUint32(p, total - 8, true);
  p += 4;
  str('WAVE');
  str('fmt ');
  v.setUint32(p, fmtSize, true);
  p += 4;
  const tag = opts.extensible ? 0xfffe : opts.float ? 3 : 1;
  v.setUint16(p, tag, true);
  v.setUint16(p + 2, ch, true);
  v.setUint32(p + 4, sr, true);
  v.setUint32(p + 8, sr * ch * bps, true);
  v.setUint16(p + 12, ch * bps, true);
  v.setUint16(p + 14, bits, true);
  if (opts.extensible) {
    v.setUint16(p + 16, 22, true);
    v.setUint16(p + 18, bits, true);
    v.setUint32(p + 20, 0, true);
    v.setUint16(p + 24, opts.float ? 3 : 1, true);
  }
  p += fmtSize;
  if (opts.extraChunk) {
    str('LIST');
    v.setUint32(p, 25, true);
    p += 4;
    p += 26;
  }
  str('data');
  v.setUint32(p, opts.zeroDataSize ? 0 : dataSize, true);
  p += 4;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < ch; c++) {
      const x = opts.samples[c][f];
      if (opts.float) v.setFloat32(p, x, true);
      else if (bits === 8) v.setUint8(p, Math.round(x * 127) + 128);
      else if (bits === 16) v.setInt16(p, Math.round(x * 32767), true);
      else if (bits === 24) {
        const n = Math.round(x * 8388607);
        v.setUint8(p, n & 255);
        v.setUint8(p + 1, (n >> 8) & 255);
        v.setUint8(p + 2, (n >> 16) & 255);
      } else v.setInt32(p, Math.round(x * 2147483647), true);
      p += bps;
    }
  }
  return new Uint8Array(buf);
}
