<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import { settings } from './lib/settings.svelte';
  import { findAction, isTypingTarget, type ActionId } from './lib/keys';
  import { RUN, GLOBAL_ACTIONS } from './lib/actions';
  import { filesFromDrop } from './lib/io/files';
  import { theme } from './lib/theme.svelte';
  import StartScreen from './components/StartScreen.svelte';
  import TopBar from './components/TopBar.svelte';
  import Overview from './components/Overview.svelte';
  import Timeline from './components/Timeline.svelte';
  import NowPlaying from './components/NowPlaying.svelte';
  import Inspector from './components/Inspector.svelte';
  import SidePanel from './components/SidePanel.svelte';
  import SpeakerPicker from './components/SpeakerPicker.svelte';
  import HelpOverlay from './components/HelpOverlay.svelte';
  import Settings from './components/Settings.svelte';
  import Dialog from './components/Dialog.svelte';
  import Toasts from './components/Toasts.svelte';
  import ContextMenu from './components/ContextMenu.svelte';

  const REPEATABLE = new Set<ActionId>(['seekBack', 'seekFwd', 'seekBackBig', 'seekFwdBig', 'zoomIn', 'zoomOut', 'undo', 'redo', 'nextSpan', 'prevSpan']);

  function onKeydown(e: KeyboardEvent) {
    if (app.dialog) return;
    const action = findAction(settings.keymap, e);
    if (isTypingTarget(e.target)) {
      if (action === 'save') {
        e.preventDefault();
        (e.target as HTMLElement).blur();
        RUN.save();
      }
      return;
    }
    if (app.pickerOpen || app.settingsOpen) return;
    if (app.helpOpen) {
      if (action === 'help' || action === 'escape') {
        e.preventDefault();
        app.helpOpen = false;
      }
      return;
    }
    if (!action) return;
    if (!app.audio && !GLOBAL_ACTIONS.has(action)) return;
    e.preventDefault();
    if (e.repeat && !REPEATABLE.has(action)) return;
    RUN[action]();
  }

  // Clicked buttons keep focus, which would make Space/Enter re-trigger them; hotkeys win.
  function onPointerUp(e: PointerEvent) {
    const b = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], input[type="checkbox"], input[type="range"]');
    if (b instanceof HTMLElement) setTimeout(() => b.blur(), 0);
  }

  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

  function onDragEnter(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    app.dragOver = true;
  }
  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave(e: DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) app.dragOver = false;
  }
  async function onDrop(e: DragEvent) {
    if (!hasFiles(e) || !e.dataTransfer) return;
    e.preventDefault();
    dragDepth = 0;
    app.dragOver = false;
    const picked = await filesFromDrop(e.dataTransfer);
    if (picked.length) await app.openPicked(picked);
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    void app.flushAutosave();
    if (app.audio && app.dirtyOnDisk && !(settings.data.autosaveToDisk && app.diskWritable)) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') void app.flushAutosave();
  }

  async function loadDemo(q: URLSearchParams) {
    const wav = q.get('demo') || 'AsrDiarize_2026-07-07_12-00.wav';
    const tr = q.get('transcript') ?? 'transcript_972034.json';
    const files: File[] = [];
    for (const name of [wav, tr]) {
      if (!name) continue;
      const res = await fetch('/' + name);
      if (res.ok) files.push(new File([await res.blob()], name, { type: name.endsWith('.json') ? 'application/json' : 'audio/wav' }));
    }
    if (files.length) await app.openPicked(files.map((file) => ({ file })));
  }

  onMount(() => {
    let raf = 0;
    const loop = () => {
      app.tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    void app.refreshRecent();
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search);
      if (q.has('demo')) void loadDemo(q);
    }
    return () => cancelAnimationFrame(raf);
  });

  $effect(() => {
    document.title = app.audio ? `${app.dirtyOnDisk ? '• ' : ''}${app.audio.name} — Audio Emotion Labeling` : 'Audio Emotion Labeling';
  });

  $effect(() => {
    theme.apply(settings.data.theme);
  });
</script>

<svelte:window
  onkeydown={onKeydown}
  onpointerup={onPointerUp}
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  onbeforeunload={onBeforeUnload}
/>
<svelte:document onvisibilitychange={onVisibility} />

{#if app.screen === 'start' || !app.audio}
  <StartScreen />
{:else}
  <div class="app">
    <TopBar />
    <div class="body">
      <div class="main">
        <Overview />
        <Timeline />
        <NowPlaying />
        <Inspector />
      </div>
      {#if settings.data.sideOpen}
        <SidePanel />
      {/if}
    </div>
  </div>
{/if}

{#if app.dragOver}
  <div class="drop-overlay">
    <div class="drop-card">
      <div class="big">Drop files to open</div>
      <div class="dim">WAV audio, transcript JSON and/or labels JSON — in any combination</div>
    </div>
  </div>
{/if}

{#if app.pickerOpen}<SpeakerPicker />{/if}
{#if app.helpOpen}<HelpOverlay />{/if}
{#if app.settingsOpen}<Settings />{/if}
{#if app.menu}<ContextMenu />{/if}
{#if app.dialog}<Dialog />{/if}
<Toasts />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .drop-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: grid;
    place-items: center;
    z-index: 100;
    pointer-events: none;
  }
  .drop-card {
    border: 2px dashed var(--accent);
    background: var(--panel);
    border-radius: 16px;
    padding: 40px 56px;
    text-align: center;
    box-shadow: var(--shadow);
  }
  .big {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 6px;
  }
</style>
