<script lang="ts">
  import { untrack } from "svelte";
  import { useQuery } from "../../src";

  let { params, onInitial } = $props();

  const result = useQuery(() => params);
  untrack(() => onInitial)?.(result.current);
</script>

<span data-testid="count">
  {result.current.length}
</span>

<span data-testid="has-update-each">
  {typeof result.current.updateEach === "function"}
</span>
