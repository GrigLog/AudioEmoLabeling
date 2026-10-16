<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { settings, type SideTab } from '../lib/settings.svelte';
  import TranscriptPanel from './TranscriptPanel.svelte';
  import SpansPanel from './SpansPanel.svelte';
  import SpeakersPanel from './SpeakersPanel.svelte';
  import StatsPanel from './StatsPanel.svelte';

  const tabs: { id: SideTab; label: string }[] = [
    { id: 'transcript', label: 'Transcript' },
    { id: 'spans', label: 'Spans' },
    { id: 'speakers', label: 'Speakers' },
    { id: 'stats', label: 'Stats' },
  ];

  function count(id: SideTab): string {
    if (id === 'transcript') return app.transcript.length ? String(app.transcript.length) : '';
    if (id === 'spans') return app.segments.length ? String(app.segments.length) : '';
    if (id === 'speakers') return app.speakers.length ? String(app.speakers.length) : '';
    return '';
  }

  let resizing = false;
  function startResize(e: PointerEvent) {
    resizing = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResize(e: PointerEvent) {
    if (!resizing) return;
    settings.data.sideWidth = Math.max(280, Math.min(window.innerWidth * 0.6, window.innerWidth - e.clientX));
  }
  function endResize() {
    resizing = false;
  }
</script>

<aside class="side" style="width:{settings.data.sideWidth}px">
  <div class="grip" role="separator" aria-orientation="vertical" onpointerdown={startResize} onpointermove={onResize} onpointerup={endResize}></div>
  <nav>
    {#each tabs as t (t.id)}
      <button class="tab" class:active={settings.data.sideTab === t.id} onclick={() => (settings.data.sideTab = t.id)}>
        {t.label}
        {#if count(t.id)}<span class="count">{count(t.id)}</span>{/if}
      </button>
    {/each}
  </nav>
  <div class="content">
    {#if settings.data.sideTab === 'transcript'}
      <TranscriptPanel />
    {:else if settings.data.sideTab === 'spans'}
      <SpansPanel />
    {:else if settings.data.sideTab === 'speakers'}
      <SpeakersPanel />
    {:else}
      <StatsPanel />
    {/if}
  </div>
</aside>

<style>
  .side {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-left: 1px solid var(--border);
    min-width: 280px;
  }
  .grip {
    position: absolute;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 3;
  }
  nav {
    display: flex;
    border-bottom: 1px solid var(--border);
    padding: 0 4px;
    flex: none;
  }
  .tab {
    background: none;
    border: none;
    border-radius: 0;
    border-bottom: 2px solid transparent;
    padding: 9px 10px 7px;
    color: var(--text-dim);
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .count {
    font-size: 11px;
    color: var(--text-faint);
  }
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
