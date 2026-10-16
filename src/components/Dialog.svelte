<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';

  const d = $derived(app.dialog!);
  let box: HTMLDivElement;

  onMount(() => {
    box.querySelector<HTMLButtonElement>('button.primary, button')?.focus();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      d.resolve(null);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop">
  <div class="dialog" bind:this={box} role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h3 id="dlg-title">{d.title}</h3>
    <p>{d.message}</p>
    <div class="buttons">
      {#each d.buttons as b (b.id)}
        <button class:primary={b.primary} class:danger={b.danger} onclick={() => d.resolve(b.id)}>{b.label}</button>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .dialog {
    width: min(520px, 100%);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 18px 20px;
  }
  h3 {
    margin: 0 0 8px;
  }
  p {
    margin: 0 0 16px;
    white-space: pre-line;
    color: var(--text-dim);
  }
  .buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
</style>
