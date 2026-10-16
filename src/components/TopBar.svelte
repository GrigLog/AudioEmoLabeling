<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { settings } from '../lib/settings.svelte';
  import { fmtTime, fmtClock } from '../lib/format';
  import { pickFiles, canSaveInPlace } from '../lib/io/files';
  import Kbd from './Kbd.svelte';

  let saveMenu = $state(false);

  async function addJson() {
    const picked = await pickFiles('json');
    if (picked.length) await app.openPicked(picked);
  }

  const status = $derived.by(() => {
    if (app.dirtyOnDisk) {
      if (app.labelsHandle && app.diskWritable && settings.data.autosaveToDisk) return { text: 'Saving…', cls: 'pending' };
      return {
        text: app.autosavedAt ? 'Unsaved to file · autosaved in browser' : 'Unsaved changes',
        cls: 'dirty',
      };
    }
    if (app.diskSavedAt) return { text: `Saved${app.labelsName ? ` to ${app.labelsName}` : ''} · ${fmtClock(app.diskSavedAt)}`, cls: 'ok' };
    if (app.labelsName) return { text: `Up to date with ${app.labelsName}`, cls: 'ok' };
    return { text: 'No changes yet', cls: '' };
  });

  const tooltip = $derived(
    app.labelsHandle && !app.diskWritable
      ? `Press Save (Ctrl+S) to allow writing to "${app.labelsName}" again.`
      : canSaveInPlace()
        ? 'Ctrl+S saves the labels file; after the first save, changes are written to it automatically.'
        : 'Ctrl+S downloads the labels file. Work is also autosaved in this browser.',
  );
</script>

<div class="bar">
  <div class="group">
    <button class="play" class:on={app.playing} onclick={() => app.togglePlay()} title="Play / pause (Space)">
      {#if app.playing}
        <svg viewBox="0 0 16 16" width="16" height="16"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
      {:else}
        <svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5z" fill="currentColor" /></svg>
      {/if}
    </button>
    <div class="time mono">
      <span class="now">{fmtTime(app.time, 1)}</span>
      <span class="faint">/ {fmtTime(app.audio?.duration ?? 0, 0)}</span>
    </div>
    <select class="rate" value={app.rate} onchange={(e) => {
        const el = e.target as HTMLSelectElement;
        app.setRate(Number(el.value));
        el.blur();
      }} title="Playback speed ([ and ])">
      {#each app.rates as r (r)}
        <option value={r}>{r}×</option>
      {/each}
    </select>
    <button class="toggle" class:active={settings.data.follow} onclick={() => app.toggleFollow()} title="Follow playhead: auto-scroll and select the span being played (F)">
      Follow <Kbd action="follow" />
    </button>
    <button class="toggle" class:active={app.loopOn} onclick={() => app.toggleLoop()} title="Loop the selected span (L)">
      Loop <Kbd action="loop" />
    </button>
  </div>

  <div class="files">
    <button class="ghost file" onclick={() => app.closeAudio()} title="Close and go back to the start screen">
      🎧 <span class="name">{app.audio?.name}</span>
    </button>
    {#if app.transcriptName}
      <span class="chip" title="{app.transcript.length} transcript lines">📝 {app.transcriptName}
        <button class="ghost x" onclick={() => app.removeTranscript()} title="Remove transcript">✕</button>
      </span>
    {:else}
      <button class="ghost file add" onclick={addJson} title="Add a transcript (or labels) JSON — or drop it anywhere">+ Transcript</button>
    {/if}
  </div>

  <div class="group right">
    <button class="ghost" disabled={!app.canUndo} onclick={() => app.undo()} title="Undo (Ctrl/⌘+Z)">↶</button>
    <button class="ghost" disabled={!app.canRedo} onclick={() => app.redo()} title="Redo (Ctrl/⌘+Shift+Z)">↷</button>
    <span class="status {status.cls}" title={tooltip}>{status.text}</span>
    <div class="save-wrap">
      <button class="primary" onclick={() => app.save()} title={tooltip}>Save <Kbd action="save" /></button>
      <button class="caret" onclick={() => (saveMenu = !saveMenu)} title="More save options">▾</button>
      {#if saveMenu}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="backdrop" onclick={() => (saveMenu = false)}></div>
        <div class="menu">
          {#if canSaveInPlace()}
            <button class="ghost" onclick={() => { saveMenu = false; void app.save({ as: true }); }}>Save as…</button>
          {/if}
          <button class="ghost" onclick={() => { saveMenu = false; app.downloadCopy(); }}>Download a copy</button>
        </div>
      {/if}
    </div>
    <button class="ghost icon" onclick={() => (app.settingsOpen = true)} title="Settings">⚙</button>
    <button class="ghost icon" onclick={() => (app.helpOpen = true)} title="Keyboard shortcuts (?)">?</button>
    <button class="ghost icon" class:active={settings.data.sideOpen} onclick={() => (settings.data.sideOpen = !settings.data.sideOpen)} title="Toggle side panel">▥</button>
  </div>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    min-height: 46px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .right {
    margin-left: auto;
  }
  .play {
    width: 36px;
    height: 32px;
    justify-content: center;
    padding: 0;
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  .time {
    min-width: 150px;
    font-size: 15px;
  }
  .now {
    font-weight: 600;
  }
  .rate {
    padding: 3px 4px;
  }
  .toggle {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .toggle.active,
  .icon.active {
    color: var(--text);
    border-color: var(--accent);
  }
  .files {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  .file {
    min-width: 0;
    max-width: 320px;
    overflow: hidden;
    font-size: 13px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .add {
    color: var(--text-dim);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 13px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .x {
    padding: 0 4px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .status {
    font-size: 12px;
    color: var(--text-dim);
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status.dirty {
    color: var(--accent);
  }
  .status.ok {
    color: var(--success);
  }
  .save-wrap {
    position: relative;
    display: flex;
  }
  .save-wrap .primary {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .caret {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: none;
    padding: 4px 6px;
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow);
    padding: 4px;
    display: flex;
    flex-direction: column;
    z-index: 30;
    min-width: 170px;
  }
  .menu button {
    justify-content: flex-start;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 29;
  }
  .icon {
    font-size: 15px;
    padding: 4px 8px;
  }
</style>
