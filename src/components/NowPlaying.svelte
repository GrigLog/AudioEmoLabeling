<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { fmtTime } from '../lib/format';

  const lines = $derived(app.tindex.at(app.time));
</script>

<div class="now">
  {#if app.transcript.length === 0}
    <span class="faint">No transcript. Drop a transcript JSON to see what's being said here and prefill span texts.</span>
  {:else if lines.length}
    {#each lines as l (l.id)}
      <div class="line">
        <span class="t mono faint">{fmtTime(l.start, 1)}</span>
        {#if l.author}<span class="author">{l.author}</span>{/if}
        <span class="text">{l.text}</span>
      </div>
    {/each}
  {:else}
    <span class="faint">— no transcript line here —</span>
  {/if}
  {#if app.lineTarget && !app.recording}
    <span class="target">no span yet — a label key creates one from this line</span>
  {/if}
</div>

<style>
  .now {
    flex: none;
    min-height: 44px;
    max-height: 76px;
    overflow: auto;
    padding: 8px 14px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    font-size: 17px;
    line-height: 1.35;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;
  }
  .line {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .t {
    font-size: 12px;
    flex: none;
  }
  .author {
    font-size: 12px;
    padding: 0 6px;
    border-radius: 6px;
    background: var(--panel-3);
    color: var(--text-dim);
    flex: none;
  }
  .text {
    font-weight: 500;
  }
  .target {
    position: absolute;
    right: 10px;
    top: 4px;
    font-size: 11px;
    color: var(--accent);
  }
  .faint {
    font-size: 13px;
  }
</style>
