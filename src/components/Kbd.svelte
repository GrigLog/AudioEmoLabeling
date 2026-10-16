<script lang="ts">
  import { bindingLabel, type ActionId } from '../lib/keys';
  import { settings } from '../lib/settings.svelte';

  let { action, all = false }: { action: ActionId; all?: boolean } = $props();
  const keys = $derived(settings.keymap[action] ?? []);
</script>

{#if keys.length}
  {#each all ? keys : keys.slice(0, 1) as b, i (i)}
    <kbd>{bindingLabel(b)}</kbd>
  {/each}
{/if}
