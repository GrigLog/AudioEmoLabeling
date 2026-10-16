<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { ROLES, ROLE_LABEL, type Role } from '../lib/model/types';
  import { parseSpeakerQuery, speakerId, speakerLabel } from '../lib/model/speakers';
  import { fmtDuration } from '../lib/format';

  const stats = $derived.by(() => {
    const m = new Map<string, { count: number; dur: number; first: number }>();
    for (const s of app.segments) {
      if (!s.speaker) continue;
      const e = m.get(s.speaker) ?? { count: 0, dur: 0, first: s.start };
      e.count++;
      e.dur += s.end - s.start;
      e.first = Math.min(e.first, s.start);
      m.set(s.speaker, e);
    }
    return m;
  });

  const GROUP_TITLE: Record<Role, string> = { consultant: 'Consultants', client: 'Clients', unclear: 'Unclear speakers' };

  const byRole = $derived(ROLES.map((role) => ({ role, list: app.speakers.filter((s) => s.role === role) })));

  let mergeFrom = $state<string | null>(null);
  let mergeTo = $state('');

  function startMerge(id: string) {
    mergeFrom = id;
    mergeTo = '';
  }

  function doMerge() {
    if (!mergeFrom) return;
    const p = parseSpeakerQuery(mergeTo);
    if (!p) return;
    app.mergeSpeaker(mergeFrom, speakerId(p.role, p.n));
    mergeFrom = null;
  }

  /** ▶ plays the speaker's next span after the playhead (wrapping around). */
  function sample(id: string) {
    const list = app.segments.filter((s) => s.speaker === id);
    if (!list.length) return;
    const next = list.find((s) => s.start > app.time + 0.05) ?? list[0];
    app.select([next.id], { seek: true });
    app.playSpan(next);
  }

  function addNew(role: Role) {
    app.speakerKey(role, true);
  }
</script>

<div class="wrap">
  <p class="dim small intro">
    A speaker is a role plus an optional number. Nicknames help you recognize returning clients. Merge to renumber or to fold "Client" spans
    into "Client 3".
  </p>
  {#each byRole as g (g.role)}
    <div class="group">
      <div class="gh">
        <span class="role-dot role-{g.role}"></span>
        <b>{GROUP_TITLE[g.role]}</b>
        <span class="spacer"></span>
        <button class="small-btn" onclick={() => addNew(g.role)} title="Create the next numbered {ROLE_LABEL[g.role].toLowerCase()} and make it current">+ new #</button>
      </div>
      {#if !g.list.length}
        <div class="faint small none">none yet</div>
      {/if}
      {#each g.list as sp (sp.id)}
        {@const st = stats.get(sp.id)}
        <div class="sp" class:current={app.current[sp.role] === sp.id}>
          <button
            class="cur"
            title={app.current[sp.role] === sp.id ? 'Current — the role key assigns this one' : 'Make current (role key will assign it)'}
            onclick={() => app.setCurrent(sp.role, sp.id)}
          >
            {app.current[sp.role] === sp.id ? '●' : '○'}
          </button>
          <div class="info">
            <div class="name">
              <b>{speakerLabel(sp.id)}</b>
              <span class="faint small">{st ? `${st.count} spans · ${fmtDuration(st.dur)}` : 'unused'}</span>
            </div>
            <input
              class="nick"
              value={sp.name ?? ''}
              placeholder="nickname (optional)"
              onchange={(e) => app.setNickname(sp.id, (e.target as HTMLInputElement).value)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
          <div class="acts">
            <button class="ghost" disabled={!st} onclick={() => sample(sp.id)} title="Play this speaker's next span">▶</button>
            <button class="ghost" disabled={!st} onclick={() => startMerge(sp.id)} title="Merge into / renumber">⇢</button>
            {#if !st}<button class="ghost faint" onclick={() => app.removeSpeaker(sp.id)} title="Remove">✕</button>{/if}
          </div>
        </div>
        {#if mergeFrom === sp.id}
          <div class="merge">
            Move all {st?.count ?? 0} spans of <b>{speakerLabel(sp.id)}</b> to
            <!-- svelte-ignore a11y_autofocus -->
            <input
              autofocus
              bind:value={mergeTo}
              placeholder="e.g. c3, k2, client"
              onkeydown={(e) => {
                if (e.key === 'Enter') doMerge();
                if (e.key === 'Escape') mergeFrom = null;
              }}
            />
            {#if parseSpeakerQuery(mergeTo)}
              {@const p = parseSpeakerQuery(mergeTo)!}
              <span class="dim">→ {speakerLabel(speakerId(p.role, p.n))}</span>
            {/if}
            <button class="primary small-btn" disabled={!parseSpeakerQuery(mergeTo)} onclick={doMerge}>Move</button>
            <button class="small-btn" onclick={() => (mergeFrom = null)}>Cancel</button>
          </div>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .wrap {
    overflow-y: auto;
    padding: 6px 10px 20px;
    flex: 1;
  }
  .intro {
    margin: 4px 0 10px;
  }
  .small {
    font-size: 12px;
  }
  .small-btn {
    font-size: 12px;
    padding: 2px 8px;
  }
  .group {
    margin-bottom: 14px;
  }
  .gh {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .spacer {
    flex: 1;
  }
  .role-dot {
    width: 12px;
    height: 4px;
    border-radius: 2px;
  }
  .role-consultant {
    background: var(--role-consultant);
  }
  .role-client {
    background: var(--role-client);
  }
  .role-unclear {
    background: var(--role-unclear);
  }
  .none {
    padding-left: 18px;
  }
  .sp {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px;
    border-radius: 6px;
  }
  .sp.current {
    background: var(--panel-2);
  }
  .cur {
    background: none;
    border: none;
    padding: 0 4px;
    color: var(--accent);
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .nick {
    width: 100%;
    margin-top: 2px;
    padding: 2px 6px;
    font-size: 12.5px;
    background: transparent;
    border-color: transparent;
  }
  .nick:hover,
  .nick:focus {
    border-color: var(--border);
    background: var(--panel-2);
  }
  .acts {
    display: flex;
  }
  .acts button {
    padding: 2px 6px;
  }
  .merge {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    font-size: 12.5px;
    padding: 6px 8px 8px 26px;
  }
  .merge input {
    width: 130px;
    padding: 2px 6px;
  }
</style>
