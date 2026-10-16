import type { PeakData, RawCache } from '../audio/peaks';
import type { TranscriptIndex } from '../io/transcript';
import type { LaneLayout } from '../model/lanes';
import { segmentsInRange } from '../model/ops';
import { roleOf, speakerLabel, speakerShort } from '../model/speakers';
import { EMOTION_LABEL, type Emotion, type Role, type Segment, type TranscriptLine } from '../model/types';
import type { Recording } from '../app.svelte';
import { fmtTime } from '../format';
import type { Viewport } from './view';

export interface Palette {
  bg: string;
  waveBg: string;
  wave: string;
  waveLoading: string;
  grid: string;
  text: string;
  textDim: string;
  rulerBg: string;
  playhead: string;
  hover: string;
  accent: string;
  laneBg: string;
  transBg: string;
  transBlock: string;
  transText: string;
  transActive: string;
  none: string;
  emotion: Record<Emotion, string>;
  role: Record<Role, string>;
}

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim() || '#888';
  return {
    bg: v('--tl-bg'),
    waveBg: v('--tl-wave-bg'),
    wave: v('--tl-wave'),
    waveLoading: v('--tl-wave-loading'),
    grid: v('--tl-grid'),
    text: v('--text'),
    textDim: v('--text-dim'),
    rulerBg: v('--tl-ruler-bg'),
    playhead: v('--playhead'),
    hover: v('--tl-hover'),
    accent: v('--accent'),
    laneBg: v('--tl-lane-bg'),
    transBg: v('--tl-trans-bg'),
    transBlock: v('--tl-trans-block'),
    transText: v('--tl-trans-text'),
    transActive: v('--tl-trans-active'),
    none: v('--emo-none'),
    emotion: {
      positive: v('--emo-positive'),
      neutral: v('--emo-neutral'),
      angry: v('--emo-angry'),
      sad: v('--emo-sad'),
      unclear: v('--emo-unclear'),
    },
    role: {
      consultant: v('--role-consultant'),
      client: v('--role-client'),
      unclear: v('--role-unclear'),
    },
  };
}

export const RULER_H = 22;
export const LANE_H = 24;
const LANE_GAP = 3;
const MAX_LANES_SHOWN = 6;

export interface Layout {
  width: number;
  height: number;
  waveTop: number;
  waveH: number;
  lanesTop: number;
  lanesH: number;
  laneH: number;
  transTop: number;
  transH: number;
  transRows: number;
}

export function computeLayout(width: number, height: number, laneCount: number, hasTranscript: boolean): Layout {
  const lanes = Math.min(MAX_LANES_SHOWN, Math.max(2, laneCount));
  const transRows = hasTranscript ? 2 : 0;
  const transH = hasTranscript ? 40 : 0;
  let laneH = LANE_H;
  let lanesH = lanes * (laneH + LANE_GAP) + LANE_GAP;
  let waveH = height - RULER_H - lanesH - transH;
  if (waveH < 60) {
    laneH = Math.max(14, Math.floor((height - RULER_H - transH - 60) / lanes) - LANE_GAP);
    lanesH = lanes * (laneH + LANE_GAP) + LANE_GAP;
    waveH = Math.max(30, height - RULER_H - lanesH - transH);
  }
  const waveTop = RULER_H;
  const lanesTop = waveTop + waveH;
  const transTop = lanesTop + lanesH;
  return { width, height, waveTop, waveH, lanesTop, lanesH, laneH, transTop, transH, transRows };
}

export interface DrawState {
  view: Viewport;
  layout: Layout;
  pal: Palette;
  peaks: PeakData | null;
  raw: RawCache | null;
  gain: number;
  segments: readonly Segment[];
  maxDur: number;
  lanes: LaneLayout;
  selected: ReadonlySet<string>;
  tindex: TranscriptIndex;
  time: number;
  playing: boolean;
  recording: Recording | null;
  lineTarget: TranscriptLine | null;
  hover: { x: number; seg: string | null; edge: 'start' | 'end' | null; line: string | null } | null;
  drag: { a: number; b: number } | null;
  peaksProgress: number;
}

let colMin = new Float32Array(0);
let colMax = new Float32Array(0);
let hatchCache: { color: string; pattern: CanvasPattern | null } | null = null;

function hatch(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  if (hatchCache?.color === color && hatchCache.pattern) return hatchCache.pattern;
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-2, 10);
  g.lineTo(10, -2);
  g.moveTo(-2, 2);
  g.lineTo(2, -2);
  g.moveTo(6, 10);
  g.lineTo(10, 6);
  g.stroke();
  const pattern = ctx.createPattern(c, 'repeat');
  hatchCache = { color, pattern };
  return pattern ?? color;
}

const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function alpha(color: string, a: number): string {
  // Accepts #rgb / #rrggbb; anything else is returned unchanged.
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
    const n = parseInt(hex.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color;
}

export function laneY(l: Layout, lane: number): number {
  return l.lanesTop + LANE_GAP + lane * (l.laneH + LANE_GAP);
}

export function drawTimeline(ctx: CanvasRenderingContext2D, s: DrawState): void {
  const { view, layout: L, pal } = s;
  const W = L.width;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, L.height);

  const t0 = view.start;
  const t1 = view.end;
  const pps = view.pxPerSec;
  const X = (t: number) => (t - t0) * pps;
  const visible = segmentsInRange(s.segments, t0, t1, s.maxDur);

  // --- ruler ---
  ctx.fillStyle = pal.rulerBg;
  ctx.fillRect(0, 0, W, RULER_H);
  let step = STEPS[STEPS.length - 1];
  for (const st of STEPS) {
    if (st * pps >= 80) {
      step = st;
      break;
    }
  }
  const minor = step / (String(step).startsWith('2') ? 4 : 5);
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
    const x = Math.round(X(t)) + 0.5;
    ctx.moveTo(x, RULER_H - 5);
    ctx.lineTo(x, RULER_H);
  }
  ctx.stroke();
  ctx.fillStyle = pal.textDim;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const digits = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  ctx.beginPath();
  ctx.strokeStyle = pal.grid;
  for (let t = Math.floor(t0 / step) * step; t <= t1; t += step) {
    const x = Math.round(X(t)) + 0.5;
    ctx.moveTo(x, 4);
    ctx.lineTo(x, L.lanesTop);
    ctx.fillText(fmtTime(t, digits), x + 4, 10);
  }
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // --- waveform background + emotion tint ---
  ctx.fillStyle = pal.waveBg;
  ctx.fillRect(0, L.waveTop, W, L.waveH);
  for (const seg of visible) {
    const x0 = Math.max(0, X(seg.start));
    const x1 = Math.min(W, X(seg.end));
    const sel = s.selected.has(seg.id);
    ctx.fillStyle = seg.emotion ? alpha(pal.emotion[seg.emotion], sel ? 0.28 : 0.14) : alpha(pal.none, sel ? 0.22 : 0.1);
    ctx.fillRect(x0, L.waveTop, x1 - x0, L.waveH);
  }
  if (s.lineTarget) {
    const x0 = X(s.lineTarget.start);
    const x1 = X(s.lineTarget.end);
    ctx.fillStyle = alpha(pal.accent, 0.08);
    ctx.fillRect(x0, L.waveTop, x1 - x0, L.waveH);
  }

  // --- waveform ---
  if (colMin.length < W + 2) {
    colMin = new Float32Array(W + 2);
    colMax = new Float32Array(W + 2);
  }
  const n = Math.ceil(W);
  const spp = 1 / pps;
  const mid = L.waveTop + L.waveH / 2;
  const amp = (L.waveH / 2 - 2) * s.gain;
  let haveCols = false;
  if (s.raw && s.peaks && spp < s.peaks.binDur * 0.75) haveCols = s.raw.fillColumns(t0, spp, n, colMin, colMax);
  if (!haveCols && s.peaks) {
    s.peaks.fillColumns(t0, spp, n, colMin, colMax);
    haveCols = true;
  }
  if (haveCols) {
    ctx.fillStyle = pal.wave;
    const lim = L.waveH / 2 - 1;
    for (let x = 0; x < n; x++) {
      const lo = colMin[x];
      const hi = colMax[x];
      if (Number.isNaN(lo)) continue;
      const yTop = mid - Math.min(lim, hi * amp);
      const yBot = mid - Math.max(-lim, lo * amp);
      ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
    }
  }
  ctx.fillStyle = pal.grid;
  ctx.fillRect(0, Math.round(mid), W, 1);
  if (s.peaks && !s.peaks.complete) {
    const loadedT = (s.peaks.loadedBins * s.peaks.binDur);
    const lx = Math.max(0, X(loadedT));
    if (lx < W) {
      ctx.fillStyle = hatch(ctx, pal.waveLoading);
      ctx.fillRect(lx, L.waveTop, W - lx, L.waveH);
    }
    ctx.fillStyle = pal.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`Building waveform… ${Math.round(s.peaksProgress * 100)}%`, 10, L.waveTop + 14);
  }

  // --- lanes ---
  ctx.fillStyle = pal.laneBg;
  ctx.fillRect(0, L.lanesTop, W, L.lanesH);
  ctx.font = '600 12px system-ui, sans-serif';
  for (const seg of visible) {
    const lane = s.lanes.lane.get(seg.id) ?? 0;
    if (lane >= MAX_LANES_SHOWN) continue;
    drawSpan(ctx, s, seg, X(seg.start), X(seg.end), laneY(L, lane), L.laneH);
  }
  if (s.recording) {
    const a = Math.min(s.recording.start, s.time);
    const b = Math.max(s.recording.start, s.time);
    const x0 = X(a);
    const x1 = Math.max(x0 + 2, X(b));
    ctx.fillStyle = alpha(pal.accent, 0.12);
    ctx.fillRect(x0, L.waveTop, x1 - x0, L.waveH);
    const y = laneY(L, 0);
    ctx.save();
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.fillStyle = s.recording.emotion ? alpha(pal.emotion[s.recording.emotion], 0.6) : alpha(pal.accent, 0.25);
    roundRect(ctx, x0, y, x1 - x0, L.laneH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = pal.text;
    ctx.fillText(`● REC ${s.recording.speaker ? speakerLabel(s.recording.speaker) : ''}`, x0 + 6, y + L.laneH / 2 + 1);
  }

  // --- transcript lane ---
  if (L.transH > 0) {
    ctx.fillStyle = pal.transBg;
    ctx.fillRect(0, L.transTop, W, L.transH);
    const rowH = (L.transH - 4) / L.transRows;
    const lines = s.tindex.inRange(t0, t1);
    const rowEnd: number[] = new Array(L.transRows).fill(-Infinity);
    ctx.font = '12px system-ui, sans-serif';
    // Assign rows over all lines that may overlap the visible ones, for stable placement.
    for (const line of lines) {
      let row = 0;
      while (row < L.transRows - 1 && rowEnd[row] > line.start + 1e-6) row++;
      rowEnd[row] = line.end;
      const x0 = X(line.start);
      const x1 = X(line.end);
      const y = L.transTop + 2 + row * rowH;
      const active = s.time >= line.start && s.time < line.end;
      const hovered = s.hover?.line === line.id;
      const target = s.lineTarget?.id === line.id;
      ctx.fillStyle = active ? pal.transActive : pal.transBlock;
      roundRect(ctx, x0 + 0.5, y + 1, Math.max(1, x1 - x0 - 1), rowH - 2, 3);
      ctx.fill();
      if (hovered || target) {
        ctx.save();
        if (target) ctx.setLineDash([4, 3]);
        ctx.strokeStyle = target ? pal.accent : pal.textDim;
        ctx.stroke();
        ctx.restore();
      }
      if (x1 - x0 > 24) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.max(0, x0) + 4, y, Math.min(W, x1) - Math.max(0, x0) - 8, rowH);
        ctx.clip();
        ctx.fillStyle = pal.transText;
        ctx.fillText(line.text, Math.max(0, x0) + 4, y + rowH / 2 + 1);
        ctx.restore();
      }
    }
  }

  // --- drag preview ---
  if (s.drag) {
    const x0 = X(Math.min(s.drag.a, s.drag.b));
    const x1 = X(Math.max(s.drag.a, s.drag.b));
    ctx.fillStyle = alpha(pal.accent, 0.18);
    ctx.fillRect(x0, L.waveTop, x1 - x0, L.lanesTop + L.lanesH - L.waveTop);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x0) + 0.5, L.waveTop + 0.5, Math.round(x1 - x0), L.lanesTop + L.lanesH - L.waveTop - 1);
    ctx.fillStyle = pal.text;
    ctx.font = '11px system-ui, sans-serif';
    const d = Math.abs(s.drag.b - s.drag.a);
    ctx.fillText(`${d.toFixed(2)} s`, x0 + 4, L.waveTop + 12);
  }

  // --- hover line ---
  if (s.hover && !s.drag) {
    const x = Math.round(s.hover.x) + 0.5;
    ctx.strokeStyle = pal.hover;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, RULER_H);
    ctx.lineTo(x, L.height);
    ctx.stroke();
    const label = fmtTime(view.xToTime(s.hover.x), 2);
    ctx.font = '11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 8;
    const lx = Math.min(W - tw, x + 4);
    ctx.fillStyle = pal.rulerBg;
    ctx.fillRect(lx, 0, tw, RULER_H - 6);
    ctx.fillStyle = pal.text;
    ctx.fillText(label, lx + 4, 9);
  }

  // --- playhead ---
  const px = X(s.time);
  if (px >= -1 && px <= W + 1) {
    ctx.fillStyle = pal.playhead;
    ctx.fillRect(Math.round(px) - 1, RULER_H, 2, L.height - RULER_H);
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 8);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSpan(ctx: CanvasRenderingContext2D, s: DrawState, seg: Segment, x0: number, x1: number, y: number, h: number) {
  const pal = s.pal;
  const sel = s.selected.has(seg.id);
  const hov = s.hover?.seg === seg.id;
  const w = Math.max(2, x1 - x0);
  roundRect(ctx, x0 + 0.5, y, w - 1, h, 4);
  if (seg.emotion) {
    ctx.fillStyle = alpha(pal.emotion[seg.emotion], hov || sel ? 0.95 : 0.78);
    ctx.fill();
  } else {
    ctx.fillStyle = alpha(pal.none, 0.5);
    ctx.fill();
    ctx.fillStyle = hatch(ctx, alpha(pal.text, 0.18));
    ctx.fill();
  }
  if (sel) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.text;
    ctx.stroke();
  } else if (!seg.emotion || !seg.speaker) {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(pal.text, 0.5);
    ctx.stroke();
    ctx.restore();
  }
  // Role strip along the top edge.
  const role = roleOf(seg.speaker);
  if (role && w > 6) {
    ctx.fillStyle = pal.role[role];
    ctx.fillRect(x0 + 3, y + 1, w - 6, 3);
  }
  if (s.hover?.seg === seg.id && s.hover.edge) {
    ctx.fillStyle = pal.text;
    const ex = s.hover.edge === 'start' ? x0 : x1 - 3;
    ctx.fillRect(ex, y, 3, h);
  }
  if (w < 18) return;
  const L = s.layout;
  const vx0 = Math.max(0, x0) + 6;
  const vx1 = Math.min(L.width, x1) - 4;
  if (vx1 - vx0 < 8) return;
  let label = seg.speaker ? speakerLabel(seg.speaker) : '?';
  const extra = (seg.text ? ' ✎' : '') + (seg.note ? ' •' : '');
  const emo = seg.emotion ? EMOTION_LABEL[seg.emotion] : '';
  const full = emo ? `${label} · ${emo}${extra}` : `${label}${extra}`;
  ctx.font = '600 12px system-ui, sans-serif';
  let text = full;
  if (ctx.measureText(text).width > vx1 - vx0) text = label + extra;
  if (ctx.measureText(text).width > vx1 - vx0) {
    label = seg.speaker ? speakerShort(seg.speaker) : '?';
    text = label;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(vx0, y, vx1 - vx0, h);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 2;
  ctx.fillText(text, vx0, y + h / 2 + 2);
  ctx.restore();
}

export interface Hit {
  area: 'ruler' | 'wave' | 'lanes' | 'transcript' | 'none';
  seg: Segment | null;
  edge: 'start' | 'end' | null;
  line: TranscriptLine | null;
}

/** Finds what is under (x, y) in timeline coordinates. */
export function hitTest(
  x: number,
  y: number,
  view: Viewport,
  L: Layout,
  segments: readonly Segment[],
  maxDur: number,
  lanes: LaneLayout,
  tindex: TranscriptIndex,
): Hit {
  const none: Hit = { area: 'none', seg: null, edge: null, line: null };
  if (y < RULER_H) return { ...none, area: 'ruler' };
  const t = view.xToTime(x);
  const tol = 6 / view.pxPerSec;
  if (y >= L.lanesTop && y < L.lanesTop + L.lanesH) {
    const lane = Math.floor((y - L.lanesTop - LANE_GAP / 2) / (L.laneH + LANE_GAP));
    const cands = segmentsInRange(segments, t - tol, t + tol, maxDur).filter((s) => (lanes.lane.get(s.id) ?? 0) === lane);
    // Prefer edges (for resizing), then the span body.
    for (const s of cands) {
      const xs = view.timeToX(s.start);
      const xe = view.timeToX(s.end);
      const wide = xe - xs > 14;
      if (wide && Math.abs(x - xs) <= 5) return { area: 'lanes', seg: s, edge: 'start', line: null };
      if (wide && Math.abs(x - xe) <= 5) return { area: 'lanes', seg: s, edge: 'end', line: null };
    }
    const body = cands.find((s) => s.start <= t && t <= s.end);
    return { area: 'lanes', seg: body ?? null, edge: null, line: null };
  }
  if (y >= L.transTop && y < L.transTop + L.transH) {
    const rowH = (L.transH - 4) / L.transRows;
    const row = Math.floor((y - L.transTop - 2) / rowH);
    const lines = tindex.inRange(view.start, view.end);
    const rowEnd: number[] = new Array(L.transRows).fill(-Infinity);
    for (const line of lines) {
      let r = 0;
      while (r < L.transRows - 1 && rowEnd[r] > line.start + 1e-6) r++;
      rowEnd[r] = line.end;
      if (r === row && line.start <= t && t <= line.end) return { area: 'transcript', seg: null, edge: null, line };
    }
    return { ...none, area: 'transcript' };
  }
  if (y >= L.waveTop && y < L.lanesTop) return { ...none, area: 'wave' };
  return none;
}

/** Overview strip: the whole recording at a glance. */
export function drawOverview(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  o: {
    pal: Palette;
    duration: number;
    peaks: PeakData | null;
    gain: number;
    segments: readonly Segment[];
    uncovered: readonly TranscriptLine[];
    listenedUntil: number;
    time: number;
    view: Viewport;
  },
): void {
  const { pal } = o;
  ctx.fillStyle = pal.rulerBg;
  ctx.fillRect(0, 0, W, H);
  if (o.duration <= 0) return;
  const k = W / o.duration;
  const X = (t: number) => t * k;
  // Envelope.
  if (o.peaks) {
    const n = Math.ceil(W);
    if (colMin.length < n + 2) {
      colMin = new Float32Array(n + 2);
      colMax = new Float32Array(n + 2);
    }
    o.peaks.fillColumns(0, o.duration / W, n, colMin, colMax);
    ctx.fillStyle = pal.waveLoading;
    const mid = H / 2;
    const amp = (H / 2 - 3) * o.gain;
    for (let x = 0; x < n; x++) {
      if (Number.isNaN(colMin[x])) continue;
      const a = Math.min(H / 2 - 2, Math.max(colMax[x], -colMin[x]) * amp);
      ctx.fillRect(x, mid - a, 1, a * 2 || 1);
    }
  }
  // Transcript lines still without spans.
  ctx.fillStyle = alpha(pal.textDim, 0.35);
  for (const l of o.uncovered) ctx.fillRect(X(l.start), H - 12, Math.max(1, X(l.end) - X(l.start)), 4);
  // Spans.
  const bandY = 8;
  const bandH = H - 22;
  for (const s of o.segments) {
    const x0 = X(s.start);
    const w = Math.max(1, X(s.end) - x0);
    ctx.fillStyle = s.emotion ? alpha(pal.emotion[s.emotion], 0.85) : alpha(pal.none, 0.8);
    ctx.fillRect(x0, bandY, w, bandH);
    if (!s.emotion || !s.speaker) {
      ctx.fillStyle = pal.emotion.angry;
      ctx.fillRect(x0, 2, Math.max(2, w), 3);
    }
  }
  // Listened progress.
  ctx.fillStyle = pal.accent;
  ctx.fillRect(0, H - 3, X(o.listenedUntil), 3);
  // Viewport.
  const vx0 = X(o.view.start);
  const vx1 = Math.max(vx0 + 3, X(o.view.end));
  ctx.fillStyle = alpha(pal.text, 0.08);
  ctx.fillRect(vx0, 0, vx1 - vx0, H);
  ctx.strokeStyle = alpha(pal.text, 0.6);
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(vx0) + 0.5, 0.5, Math.round(vx1 - vx0) - 1, H - 1);
  // Playhead.
  ctx.fillStyle = pal.playhead;
  ctx.fillRect(Math.round(X(o.time)) - 1, 0, 2, H);
}
