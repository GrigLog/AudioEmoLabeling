<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { settings } from '../lib/settings.svelte';
  import { theme } from '../lib/theme.svelte';
  import { drawOverview, readPalette, type Palette } from '../lib/timeline/render';
  import { fmtTime } from '../lib/format';

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let width = $state(800);
  const H = 44;
  let pal: Palette | null = null;
  let dirty = true;
  let hoverX = $state<number | null>(null);

  $effect(() => {
    void theme.version;
    pal = null;
    dirty = true;
  });

  // Anything that changes the picture marks it dirty.
  $effect(() => {
    void app.segments;
    void app.uncovered;
    void app.listenedUntil;
    void app.peaksProgress;
    void settings.data.waveGain;
    void width;
    dirty = true;
  });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      width = wrap.clientWidth;
    });
    ro.observe(wrap);
    let raf = 0;
    let lastKey = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = app.player.time();
      const key = `${app.view.version}|${Math.round(t * 20)}`;
      if (!dirty && key === lastKey) return;
      lastKey = key;
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
    if (!canvas || !app.audio) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pal ??= readPalette();
    drawOverview(ctx, width, H, {
      pal,
      duration: app.audio.duration,
      peaks: app.peaks,
      gain: (app.peaks?.gain ?? 1) * settings.data.waveGain,
      segments: app.segments,
      uncovered: app.uncovered,
      listenedUntil: app.listenedUntil,
      time: t,
      view: app.view,
    });
  }

  function timeAt(e: PointerEvent): number {
    const r = canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * (app.audio?.duration ?? 0);
  }

  let dragging = false;
  let grabOffset = 0;

  function onDown(e: PointerEvent) {
    if (!app.audio) return;
    canvas.setPointerCapture(e.pointerId);
    dragging = true;
    const t = timeAt(e);
    // Grabbing the viewport box drags the view; clicking elsewhere jumps there.
    if (t >= app.view.start && t <= app.view.end) grabOffset = t - app.view.start;
    else {
      grabOffset = app.view.visibleDur / 2;
      app.view.scrollTo(t - grabOffset);
      app.seek(t, false);
    }
    app.followPausedUntil = performance.now() + 3000;
  }

  function onMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    hoverX = e.clientX - r.left;
    if (!dragging) return;
    app.view.scrollTo(timeAt(e) - grabOffset);
    app.followPausedUntil = performance.now() + 3000;
  }

  function onUp() {
    dragging = false;
  }
</script>

<div class="overview" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style="width:{width}px;height:{H}px"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointerleave={() => (hoverX = null)}
  ></canvas>
  {#if hoverX !== null && app.audio}
    <div class="tip mono" style="left:{Math.min(width - 70, Math.max(0, hoverX - 30))}px">
      {fmtTime((hoverX / width) * app.audio.duration, 0)}
    </div>
  {/if}
</div>

<style>
  .overview {
    position: relative;
    border-bottom: 1px solid var(--border);
    height: 44px;
    flex: none;
  }
  canvas {
    display: block;
    cursor: pointer;
    touch-action: none;
  }
  .tip {
    position: absolute;
    top: -2px;
    pointer-events: none;
    font-size: 11px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    color: var(--text-dim);
  }
</style>
