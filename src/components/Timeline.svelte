<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { settings } from '../lib/settings.svelte';
  import { theme } from '../lib/theme.svelte';
  import { computeLayout, drawTimeline, hitTest, readPalette, type Palette, type DrawState } from '../lib/timeline/render';
  import { MIN_SPAN, segmentsAt, segmentsInRange, snapTime } from '../lib/model/ops';
  import { speakerLabel } from '../lib/model/speakers';
  import { EMOTION_LABEL, type Segment, type TranscriptLine } from '../lib/model/types';
  import { fmtTime } from '../lib/format';

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(800);
  let height = $state(260);
  let pal: Palette | null = null;
  let dirty = true;

  let hover: DrawState['hover'] = null;
  let drag: { a: number; b: number } | null = null;
  let tip = $state<{ x: number; y: number; seg: Segment } | null>(null);
  let tipTimer: ReturnType<typeof setTimeout> | null = null;

  type Gesture =
    | { kind: 'scrub' }
    | { kind: 'pan'; lastX: number }
    | { kind: 'create'; a: number; x0: number; moved: boolean; area: string; line: TranscriptLine | null; seg: Segment | null; toggle: boolean }
    | { kind: 'resize'; id: string; edge: 'start' | 'end'; orig: Segment; key: string }
    | { kind: 'move'; id: string; grab: number; orig: Segment; key: string };
  let gesture: Gesture | null = null;
  let gestureSeq = 0;

  const layout = $derived(computeLayout(width, height, app.lanes.count, app.transcript.length > 0));

  $effect(() => {
    void theme.version;
    pal = null;
    dirty = true;
  });

  $effect(() => {
    void app.segments;
    void app.selection;
    void app.transcript;
    void app.recording;
    void app.lineTarget;
    void app.peaksProgress;
    void app.peaks;
    void settings.data.waveGain;
    void layout;
    dirty = true;
  });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      app.view.setWidth(width);
    });
    ro.observe(wrap);
    let raf = 0;
    let lastVersion = -1;
    let lastTime = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = app.player.time();
      const moving = app.playing || !!app.recording;
      if (!dirty && !moving && app.view.version === lastVersion && t === lastTime) return;
      lastVersion = app.view.version;
      lastTime = t;
      dirty = false;
      draw(t);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  function draw(t: number) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(width * dpr);
    const H = Math.round(height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pal ??= readPalette();
    drawTimeline(ctx, {
      view: app.view,
      layout,
      pal,
      peaks: app.peaks,
      raw: app.raw,
      gain: (app.peaks?.gain ?? 1) * settings.data.waveGain,
      segments: app.segments,
      maxDur: app.maxDur,
      lanes: app.lanes,
      selected: app.selSet,
      tindex: app.tindex,
      time: t,
      playing: app.playing,
      recording: app.recording,
      lineTarget: app.lineTarget,
      hover,
      drag,
      peaksProgress: app.peaksProgress,
    });
  }

  function pos(e: MouseEvent) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hit(x: number, y: number) {
    return hitTest(x, y, app.view, layout, app.segments, app.maxDur, app.lanes, app.tindex);
  }

  function snap(t: number, e: { altKey: boolean }, exclude?: string): number {
    if (!settings.data.snap || e.altKey) return t;
    const th = 8 / app.view.pxPerSec;
    const c: number[] = app.tindex.boundariesIn(t - th, t + th);
    for (const s of segmentsInRange(app.segments, t - th, t + th, app.maxDur)) {
      if (s.id !== exclude) c.push(s.start, s.end);
    }
    c.push(app.player.time());
    return snapTime(t, c, th);
  }

  function edgeScroll(x: number) {
    const m = 28;
    if (x < m) app.view.scrollBy(-(m - x) * 0.6);
    else if (x > width - m) app.view.scrollBy((x - (width - m)) * 0.6);
  }

  function onDown(e: PointerEvent) {
    if (!app.audio) return;
    hideTip();
    const { x, y } = pos(e);
    if (e.button === 1) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      gesture = { kind: 'pan', lastX: x };
      return;
    }
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const h = hit(x, y);
    const t = app.view.xToTime(x);
    if (h.area === 'ruler') {
      gesture = { kind: 'scrub' };
      app.seek(t, false);
      return;
    }
    if (h.seg && h.edge) {
      if (!app.selSet.has(h.seg.id)) app.select([h.seg.id], { reveal: false });
      gesture = { kind: 'resize', id: h.seg.id, edge: h.edge, orig: h.seg, key: `resize:${++gestureSeq}` };
      return;
    }
    if (h.seg && e.altKey) {
      if (!app.selSet.has(h.seg.id)) app.select([h.seg.id], { reveal: false });
      gesture = { kind: 'move', id: h.seg.id, grab: t, orig: h.seg, key: `move:${++gestureSeq}` };
      return;
    }
    gesture = {
      kind: 'create',
      a: snap(t, e),
      x0: x,
      moved: false,
      area: h.area,
      line: h.line,
      seg: h.seg,
      toggle: e.shiftKey || e.metaKey || e.ctrlKey,
    };
  }

  function onMove(e: PointerEvent) {
    const { x, y } = pos(e);
    const t = app.view.xToTime(x);
    const g = gesture;
    if (!g) {
      const h = hit(x, y);
      hover = { x, seg: h.seg?.id ?? null, edge: h.edge, line: h.line?.id ?? null };
      canvas.style.cursor = h.edge ? 'ew-resize' : h.seg || h.line || h.area === 'ruler' ? 'pointer' : h.area === 'wave' || h.area === 'lanes' ? 'crosshair' : 'default';
      dirty = true;
      scheduleTip(h.seg, e);
      return;
    }
    hover = { x, seg: null, edge: null, line: null };
    if (g.kind === 'pan') {
      app.view.scrollBy(g.lastX - x);
      g.lastX = x;
      app.followPausedUntil = performance.now() + 2500;
    } else if (g.kind === 'scrub') {
      app.seek(t, false);
    } else if (g.kind === 'create') {
      if (!g.moved && Math.abs(x - g.x0) > 4) g.moved = true;
      if (g.moved) {
        edgeScroll(x);
        drag = { a: g.a, b: snap(app.view.xToTime(x), e) };
        app.followPausedUntil = performance.now() + 2500;
      }
    } else if (g.kind === 'resize') {
      edgeScroll(x);
      const nt = snap(app.view.xToTime(x), e, g.id);
      const cur = app.segById.get(g.id) ?? g.orig;
      if (g.edge === 'start') app.setSpanTimes(g.id, Math.min(nt, cur.end - MIN_SPAN), cur.end, g.key);
      else app.setSpanTimes(g.id, cur.start, Math.max(nt, cur.start + MIN_SPAN), g.key);
      app.followPausedUntil = performance.now() + 2500;
    } else if (g.kind === 'move') {
      edgeScroll(x);
      const len = g.orig.end - g.orig.start;
      let ns = g.orig.start + (t - g.grab);
      ns = snap(ns, e, g.id);
      ns = Math.max(0, Math.min((app.audio?.duration ?? 0) - len, ns));
      app.setSpanTimes(g.id, ns, ns + len, g.key);
    }
    dirty = true;
  }

  function onUp(e: PointerEvent) {
    const g = gesture;
    gesture = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === 'create') {
      if (g.moved && drag) {
        app.createSpan(drag.a, drag.b);
      } else if (g.seg) {
        if (g.toggle) app.toggleSelect(g.seg.id);
        else app.select([g.seg.id], { seek: true, reveal: false });
      } else if (g.area === 'transcript' && g.line) {
        const line = g.line;
        app.seek(line.start, false);
        const at = segmentsAt(app.segments, (line.start + line.end) / 2, app.maxDur);
        if (at.length) app.select([at[0].id], { reveal: false });
      } else if (g.area === 'lanes') {
        app.clearSelection();
        app.seek(g.a, false);
      } else {
        app.seek(app.view.xToTime(g.x0), false);
      }
    }
    drag = null;
    dirty = true;
  }

  function onDblClick(e: MouseEvent) {
    const { x, y } = pos(e);
    const h = hit(x, y);
    if (h.seg && !h.edge) app.playSpan(h.seg);
    else if (h.line) app.createFromLine(h.line);
  }

  function onContext(e: MouseEvent) {
    e.preventDefault();
    const { x, y } = pos(e);
    const h = hit(x, y);
    if (!h.seg) return;
    if (!app.selSet.has(h.seg.id)) app.select([h.seg.id], { reveal: false });
    app.menu = { x: e.clientX, y: e.clientY, id: h.seg.id };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    hideTip();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? width : 1;
    if (e.ctrlKey || e.metaKey) {
      const f = Math.max(0.5, Math.min(2, Math.exp(-e.deltaY * unit * 0.008)));
      app.view.zoomAt(f, pos(e).x);
      return;
    }
    if (e.altKey) {
      settings.data.waveGain = Math.max(0.25, Math.min(8, settings.data.waveGain * Math.exp(-e.deltaY * unit * 0.002)));
      return;
    }
    let dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.shiftKey && !dx) dx = dy;
    else if (Math.abs(dy) > Math.abs(dx)) dx = dy;
    app.view.scrollBy(dx);
    app.followPausedUntil = performance.now() + 2500;
  }

  function onLeave() {
    hover = null;
    dirty = true;
    hideTip();
  }

  function scheduleTip(seg: Segment | null, e: MouseEvent) {
    if (tipTimer) clearTimeout(tipTimer);
    if (!seg) {
      tip = null;
      return;
    }
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (tip && tip.seg.id === seg.id) {
      tip = { x, y, seg };
      return;
    }
    tip = null;
    tipTimer = setTimeout(() => (tip = { x, y, seg: app.segById.get(seg.id) ?? seg }), 450);
  }

  function hideTip() {
    if (tipTimer) clearTimeout(tipTimer);
    tip = null;
  }
</script>

<div class="timeline" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style="width:{width}px;height:{height}px"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    onpointerleave={onLeave}
    ondblclick={onDblClick}
    oncontextmenu={onContext}
    onwheel={onWheel}
  ></canvas>
  {#if tip}
    <div class="tip" style="left:{Math.min(width - 280, tip.x + 14)}px; top:{Math.max(4, tip.y - 70)}px">
      <div>
        <b>{speakerLabel(tip.seg.speaker)}</b> ·
        {#if tip.seg.emotion}<span class="dot" style="background:var(--emo-{tip.seg.emotion})"></span> {EMOTION_LABEL[tip.seg.emotion]}{:else}<i class="dim">no emotion</i>{/if}
      </div>
      <div class="dim mono">{fmtTime(tip.seg.start, 2)} – {fmtTime(tip.seg.end, 2)} ({(tip.seg.end - tip.seg.start).toFixed(2)} s)</div>
      {#if tip.seg.text}<div class="txt">✎ {tip.seg.text}</div>{/if}
      {#if tip.seg.note}<div class="txt dim">• {tip.seg.note}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .timeline {
    position: relative;
    flex: 1 1 260px;
    min-height: 200px;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
  }
  canvas {
    display: block;
    touch-action: none;
    user-select: none;
  }
  .tip {
    position: absolute;
    pointer-events: none;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 9px;
    box-shadow: var(--shadow);
    font-size: 12.5px;
    max-width: 280px;
    z-index: 5;
  }
  .txt {
    margin-top: 3px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
</style>
