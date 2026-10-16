<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { pickFiles, canSaveInPlace } from '../lib/io/files';
  import { fmtAgo, fmtDuration } from '../lib/format';
  import type { SessionRecord } from '../lib/io/persist';

  async function open() {
    await app.openDialog();
  }

  async function openKind(kind: 'audio' | 'json') {
    const picked = await pickFiles(kind);
    if (picked.length) await app.openPicked(picked);
  }

  function pct(rec: SessionRecord): number {
    const d = rec.stats.duration || rec.doc.audio.duration;
    return d > 0 ? Math.min(100, Math.round((rec.stats.listenedUntil / d) * 100)) : 0;
  }
</script>

<div class="start">
  <div class="inner">
    <header>
      <div class="logo" aria-hidden="true">
        <span style="height:30%;background:var(--emo-positive)"></span>
        <span style="height:70%;background:var(--emo-neutral)"></span>
        <span style="height:100%;background:var(--emo-angry)"></span>
        <span style="height:55%;background:var(--emo-sad)"></span>
        <span style="height:20%;background:var(--emo-unclear)"></span>
      </div>
      <div>
        <h1>Audio Emotion Labeling</h1>
        <div class="dim">Label speakers and emotions in long recordings. Everything stays on your computer — nothing is uploaded.</div>
      </div>
    </header>

    <button class="drop" onclick={open}>
      <div class="drop-title">Drop files here or click to open</div>
      <div class="dim">Any combination — the app figures out which file is which</div>
      <div class="slots">
        <div class="slot">
          <div class="slot-h">🎧 Audio <span class="req">required</span></div>
          <div class="dim small">WAV (PCM or float, any length)</div>
        </div>
        <div class="slot" class:ok={app.pending?.transcript}>
          <div class="slot-h">📝 Transcript <span class="opt">optional</span></div>
          <div class="dim small">
            {#if app.pending?.transcript}✓ {app.pending.transcript.name}{:else}JSON array of {'{start, end, text}'}{/if}
          </div>
        </div>
        <div class="slot" class:ok={app.pending?.labels}>
          <div class="slot-h">🏷️ Labels <span class="opt">optional</span></div>
          <div class="dim small">
            {#if app.pending?.labels}✓ {app.pending.labels.picked.file.name}{:else}*.labels.json to continue work{/if}
          </div>
        </div>
      </div>
    </button>
    <div class="row">
      <button onclick={() => openKind('audio')}>Open audio…</button>
      <button onclick={() => openKind('json')}>Add transcript / labels…</button>
      <span class="spacer"></span>
      <button class="ghost" onclick={() => (app.helpOpen = true)}><kbd>?</kbd> Shortcuts & tips</button>
    </div>

    {#if app.pending?.labels}
      <div class="notice">
        Labels for <b>{app.pending.labels.doc.audio.name}</b> are ready ({app.pending.labels.doc.segments.length} spans). Now open that audio file.
      </div>
    {/if}

    {#if app.recent.length}
      <h2>Continue where you left off</h2>
      <div class="recent">
        {#each app.recent as rec (rec.key)}
          <div class="card">
            <button class="ghost card-main" onclick={() => app.reopen(rec)} title="Continue this session">
              <div class="card-title">{rec.audioName}</div>
              <div class="dim small">
                {rec.stats.segments} spans · {rec.stats.complete} fully labeled · {fmtDuration(rec.stats.labeledSeconds)} labeled ·
                {fmtDuration(rec.stats.duration)} total
                {#if rec.transcript}· transcript ✓{/if}
              </div>
              <div class="bar" title="Listened {pct(rec)}%"><div style="width:{pct(rec)}%"></div></div>
              <div class="faint small">
                {[`Edited ${fmtAgo(rec.updatedAt)}`, rec.labelsName ? `file: ${rec.labelsName}` : '', rec.audioHandle ? 'opens in one click' : ''].filter(Boolean).join(' · ')}
                {#if rec.diskDirty}<span class="warn"> · changes not saved to a labels file</span>{/if}
              </div>
            </button>
            <button class="ghost forget" title="Forget this autosave" onclick={() => app.forget(rec)}>✕</button>
          </div>
        {/each}
      </div>
      <div class="faint small">
        {#if canSaveInPlace()}
          Sessions whose audio you opened with the picker or by dropping it reopen in one click (the browser asks to allow reading it again). Otherwise
          you'll be asked to pick the audio file — your labels come back from the autosave.
        {:else}
          To continue, you'll be asked to pick the audio file again — your labels come back from the browser autosave.
        {/if}
      </div>
    {/if}

    {#if app.storage === 'none'}
      <div class="notice warn-bg">This browser blocks local storage here, so autosave is off. Save your labels file often (Ctrl+S).</div>
    {/if}
  </div>
</div>

<style>
  .start {
    height: 100%;
    overflow: auto;
    display: flex;
    justify-content: center;
    padding: 48px 20px;
  }
  .inner {
    width: min(860px, 100%);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  header {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 8px;
  }
  h1 {
    margin: 0 0 2px;
    font-size: 26px;
  }
  h2 {
    margin: 18px 0 0;
    font-size: 16px;
  }
  .logo {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 10px;
    flex: none;
  }
  .logo span {
    width: 5px;
    border-radius: 3px;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 34px 24px 24px;
    border: 2px dashed var(--border);
    border-radius: 14px;
    background: var(--panel);
    text-align: center;
    white-space: normal;
  }
  .drop:hover {
    border-color: var(--accent);
  }
  .drop-title {
    font-size: 19px;
    font-weight: 700;
  }
  .slots {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 16px;
  }
  .slot {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    background: var(--panel-2);
    text-align: left;
  }
  .slot.ok {
    border-color: var(--success);
  }
  .slot-h {
    font-weight: 600;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .req,
  .opt {
    font-size: 11px;
    font-weight: 500;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--panel-3);
    color: var(--text-dim);
  }
  .req {
    color: var(--accent);
  }
  .small {
    font-size: 12.5px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .notice {
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--panel);
    border: 1px solid var(--accent);
  }
  .warn-bg {
    border-color: var(--danger);
  }
  .warn {
    color: var(--accent);
  }
  .recent {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    display: flex;
    align-items: stretch;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .card-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    text-align: left;
    padding: 10px 14px;
    white-space: normal;
  }
  .card-title {
    font-weight: 600;
  }
  .bar {
    height: 4px;
    background: var(--panel-3);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    background: var(--accent);
  }
  .forget {
    color: var(--text-faint);
  }
  @media (max-width: 640px) {
    .slots {
      grid-template-columns: 1fr;
    }
  }
</style>
