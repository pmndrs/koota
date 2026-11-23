<script lang="ts">
  import { untrack } from 'svelte';

  let { read }: { read: () => unknown } = $props();
  untrack(() => read());
</script>
