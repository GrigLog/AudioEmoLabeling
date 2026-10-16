<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { settings } from '../lib/settings.svelte';
  import { EMOTIONS, EMOTION_LABEL, ROLES, ROLE_LABEL, type Emotion, type Role } from '../lib/model/types';
  import { parseSpeakerId, speakerId, speakerLabel } from '../lib/model/speakers';
  import { fmtTime, parseTime } from '../lib/format';
  import type { ActionId } from '../lib/keys';
  import Kbd from './Kbd.svelte';

  const EMO_ACTION: Record<Emotion, ActionId> = {
    positive: 'emoPositive',
    neutral: 'emoNeutral',
    angry: 'emoAngry',
    sad: 'emoSad',
    unclear: 'emoUnclear',
  };
  const ROLE_ACTION: Record<Role, ActionId> = { consultant: 'spkConsultant', client: 'spkClient', unclear: 'spkUnclear' };
  const NEW_ACTION: Record<Role, ActionId> = { consultant: 'spkNewConsultant', client: 'spkNewClient', unclear: 'spkNewUnclear' };

  const seg = $derived(app.primary);
  const multi = $derived(app.selected.length > 1 ? app.selected : null);
  const spk = $derived(seg?.speaker ? parseSpeakerId(seg.speaker) : null);
  const auto = $derived(seg ? app.autoText(seg) : '');
  const commonEmotion = $derived.by(() => {
    if (app.recording) return app.recording.emotion;
    const list = multi ?? (seg ? [seg] : []);
    return list.length && list.every((s) => s.emotion === list[0].emotion) ? list[0].emotion : null;
  });
  const commonRole = $derived.by(() => {
    if (app.recording) return app.recording.speaker ? parseSpeakerId(app.recording.speaker)?.role ?? null : null;
    const list = multi ?? (seg ? [seg] : []);
    const roles = list.map((s) => (s.speaker ? parseSpeakerId(s.speaker)?.role : null));
    return roles.length && roles.every((r) => r === roles[0]) ? (roles[0] ?? null) : null;
  });

  let textArea = $state<HTMLTextAreaElement | null>(null);
  let noteInput = $state<HTMLInputElement | null>(null);
  let textDraft = $state('');
  let noteDraft = $state('');
  let startStr = $state('');
  let endStr = $state('');

  const editingText = $derived(app.editing?.kind === 'text' && seg && app.editing.id === seg.id);

  // Keep the time fields and note in sync with the selected span.
  $effect(() => {
    if (seg) {
      startStr = fmtTime(seg.start, 3);
      endStr = fmtTime(seg.end, 3);
      if (document.activeElement !== noteInput) noteDraft = seg.note ?? '';
    }
  });

  $effect(() => {
    const ed = app.editing;
    if (!ed) return;
    untrack(() => {
      if (!seg || ed.id !== seg.id) return;
      if (ed.kind === 'text') {
        textDraft = seg.text ?? auto;
        void tick().then(() => {
          if (!textArea) return;
          textArea.focus();
          textArea.setSelectionRange(textArea.value.length, textArea.value.length);
        });
      } else {
        void tick().then(() => {
          noteInput?.focus();
          noteInput?.select();
          app.editing = null;
        });
      }
    });
  });

  let cancelling = false;

  function commitText() {
    if (cancelling) {
      cancelling = false;
      return;
    }
    if (!seg || !app.editing) return;
    app.setField(app.editing.id, 'text', textDraft);
    app.editing = null;
    textArea?.blur();
  }

  function cancelText() {
    cancelling = true;
    app.editing = null;
    textArea?.blur();
    cancelling = false;
  }

  function onTextKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitText();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelText();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (!seg) return;
      if (app.playing) app.player.pause();
      else app.player.playRange(seg.start, seg.end, app.loopOn);
    }
  }

  function commitNote() {
    if (seg) app.setField(seg.id, 'note', noteDraft);
  }

  function onNoteKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitNote();
      noteInput?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      noteDraft = seg?.note ?? '';
      noteInput?.blur();
    }
  }

  function commitTimes() {
    if (!seg) return;
    const s = parseTime(startStr);
    const e = parseTime(endStr);
    if (s === null || e === null) {
      startStr = fmtTime(seg.start, 3);
      endStr = fmtTime(seg.end, 3);
      return;
    }
    app.setSpanTimes(seg.id, s, e, null);
  }

  function onTimeKey(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape' && seg) {
      startStr = fmtTime(seg.start, 3);
      endStr = fmtTime(seg.end, 3);
      (e.target as HTMLInputElement).blur();
    }
  }

  function setNumber(v: string) {
    if (!spk) return;
    const n = v.trim() === '' ? null : Math.max(1, Math.floor(Number(v)));
    if (n !== null && !Number.isFinite(n)) return;
    app.setSpeaker(speakerId(spk.role, n), true);
  }

  function roleButtonLabel(role: Role): string {
    return speakerLabel(app.current[role]);
  }
</script>

<div class="inspector">
  {#if app.recording}
    <div class="head rec">
      <span class="recdot"></span>
      Marking a span from <b class="mono">{fmtTime(app.recording.start, 2)}</b> — press <Kbd action="mark" /> again to finish,
      <kbd>Esc</kbd> to cancel. Label keys apply to it.
    </div>
  {:else if multi}
    <div class="head">
      <b>{multi.length} spans selected</b>
      <span class="dim">— label buttons and keys apply to all of them</span>
      <span class="spacer"></span>
      <button onclick={() => app.merge()}>Merge <Kbd action="merge" /></button>
      <button class="danger" onclick={() => app.deleteSelected()}>Delete <Kbd action="delete" /></button>
    </div>
  {:else if seg}
    <div class="head">
      <button class="ghost" onclick={() => app.replay()} title="Play this span (R)">▶ <Kbd action="replay" /></button>
      <input class="time mono" bind:value={startStr} onblur={commitTimes} onkeydown={onTimeKey} title="Start (h:mm:ss.mmm)" />
      <span class="faint">–</span>
      <input class="time mono" bind:value={endStr} onblur={commitTimes} onkeydown={onTimeKey} title="End" />
      <span class="dim mono">{(seg.end - seg.start).toFixed(2)} s</span>
      <span class="spacer"></span>
      <button class="ghost" onclick={() => app.split()} title="Split at playhead (X)">Split <Kbd action="split" /></button>
      <button class="ghost" onclick={() => app.merge()} title="Merge with next span (M)">Merge <Kbd action="merge" /></button>
      <button class="ghost danger" onclick={() => app.deleteSelected()} title="Delete (Del)">Delete</button>
    </div>
  {:else}
    <div class="head dim">
      {#if app.lineTarget}
        Transcript line at the playhead has no span — press a speaker or emotion key to create one from it.
      {:else}
        No span selected. Drag on the waveform, press <Kbd action="mark" /> while playing to mark one, or click a span.
        {#if app.transcript.length && app.uncovered.length}
          <button class="link" onclick={() => app.createDraftsFromTranscript()}>Create {app.uncovered.length} draft spans from transcript</button>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="grid">
    <div class="labels">
      <div class="row">
        <span class="lbl">Speaker</span>
        {#each ROLES as role (role)}
          <button
            class="role role-{role}"
            class:active={commonRole === role}
            onclick={() => app.speakerKey(role, false, true)}
            title="Assign {roleButtonLabel(role)} ({ROLE_LABEL[role]} with the current number)"
          >
            <span class="stripe"></span>{roleButtonLabel(role)} <Kbd action={ROLE_ACTION[role]} />
          </button>
        {/each}
        {#if spk && !multi && !app.recording}
          <label class="num" title="Instance number (blank = none)">
            #<input
              type="number"
              min="1"
              value={spk.n ?? ''}
              placeholder="–"
              onchange={(e) => setNumber((e.target as HTMLInputElement).value)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
        {/if}
        <button class="ghost" onclick={() => (app.pickerOpen = true)} title="Pick any speaker, e.g. type c12 or k2 (S)">Pick… <Kbd action="spkPicker" /></button>
        <span class="new dim" title="New numbered speaker">
          new: <button class="mini" onclick={() => app.speakerKey('consultant', true, true)}><Kbd action={NEW_ACTION.consultant} /></button>
          <button class="mini" onclick={() => app.speakerKey('client', true, true)}><Kbd action={NEW_ACTION.client} /></button>
        </span>
      </div>
      <div class="row">
        <span class="lbl">Emotion</span>
        {#each EMOTIONS as emo (emo)}
          <button class="emo" class:active={commonEmotion === emo} style="--c: var(--emo-{emo})" onclick={() => app.setEmotion(emo, true)}>
            <span class="dot" style="background: var(--emo-{emo})"></span>{EMOTION_LABEL[emo]} <Kbd action={EMO_ACTION[emo]} />
          </button>
        {/each}
      </div>
      <div class="row small dim">
        {#if seg}
          {speakerLabel(seg.speaker)}{#if seg.speaker && app.speakers.find((s) => s.id === seg.speaker)?.name} — “{app.speakers.find((s) => s.id === seg.speaker)?.name}”{/if}
          · {seg.emotion ? EMOTION_LABEL[seg.emotion] : 'no emotion yet'}
        {:else}
          Current: {speakerLabel(app.current.consultant)} · {speakerLabel(app.current.client)}
          {#if settings.data.follow}· follow mode: labels go to the span under the playhead{/if}
        {/if}
      </div>
    </div>

    <div class="texts">
      {#if seg && !multi}
        <div class="field">
          <div class="field-h">
            <span class="lbl">Text</span>
            {#if seg.text}<span class="badge">yours</span>{:else if auto}<span class="badge auto">auto, not saved</span>{/if}
            <span class="spacer"></span>
            {#if !editingText}
              <button class="ghost" onclick={() => app.editField('text')} title="Edit text, prefilled from the transcript (T)">
                {seg.text ? 'Edit' : auto ? 'Review & accept' : 'Write'} <Kbd action="editText" />
              </button>
              {#if seg.text}<button class="ghost faint" title="Clear text" onclick={() => app.setField(seg.id, 'text', '')}>✕</button>{/if}
            {/if}
          </div>
          {#if editingText}
            <textarea bind:this={textArea} bind:value={textDraft} rows="2" onkeydown={onTextKey} onblur={commitText}></textarea>
            <div class="faint small">Enter = save · Shift+Enter = new line · Tab = play/pause span · Esc = cancel</div>
          {:else if seg.text}
            <div class="text">{seg.text}</div>
          {:else if auto}
            <div class="text auto">{auto}</div>
          {:else}
            <div class="text faint">—</div>
          {/if}
        </div>
        <div class="field">
          <div class="field-h"><span class="lbl">Note</span> <Kbd action="editNote" /></div>
          <input
            bind:this={noteInput}
            bind:value={noteDraft}
            placeholder="optional, e.g. sarcasm, loud background"
            onkeydown={onNoteKey}
            onblur={commitNote}
          />
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .inspector {
    flex: none;
    background: var(--panel);
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 170px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    flex-wrap: wrap;
  }
  .head.rec {
    color: var(--accent);
  }
  .recdot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--danger);
    animation: pulse 1s infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .spacer {
    flex: 1;
  }
  .time {
    width: 112px;
    padding: 3px 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    gap: 14px;
  }
  .labels,
  .texts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .lbl {
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
    width: 58px;
    flex: none;
  }
  .row button {
    padding: 4px 8px;
  }
  .field-h .lbl {
    width: auto;
  }
  .role {
    position: relative;
    overflow: hidden;
    padding-top: 6px;
  }
  .stripe {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }
  .role-consultant .stripe {
    background: var(--role-consultant);
  }
  .role-client .stripe {
    background: var(--role-client);
  }
  .role-unclear .stripe {
    background: var(--role-unclear);
  }
  .role.active,
  .emo.active {
    border-color: var(--text);
    background: var(--panel-2);
    box-shadow: inset 0 0 0 1px var(--text);
  }
  .emo.active {
    border-color: var(--c);
    box-shadow: inset 0 0 0 1px var(--c);
    background: color-mix(in srgb, var(--c) 22%, var(--panel-3));
  }
  .num {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--text-dim);
  }
  .num input {
    width: 56px;
    padding: 3px 6px;
  }
  .new {
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .mini {
    padding: 1px 3px;
    background: transparent;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .field-h {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
  }
  .badge {
    font-size: 10.5px;
    padding: 0 6px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--success) 25%, transparent);
    color: var(--success);
  }
  .badge.auto {
    background: var(--panel-3);
    color: var(--text-dim);
  }
  .text {
    font-size: 14px;
    max-height: 48px;
    overflow: auto;
  }
  .text.auto {
    color: var(--text-dim);
    font-style: italic;
  }
  textarea {
    width: 100%;
    font-size: 14px;
  }
  .small {
    font-size: 12px;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0 4px;
    text-decoration: underline;
  }
  @media (max-width: 1100px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
