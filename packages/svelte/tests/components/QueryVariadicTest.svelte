<script lang="ts">
  import type { QueryParameter } from "@koota/core";
  import { untrack } from "svelte";
  import { useQuery } from "../../src";

  let { params }: { params: QueryParameter[] } = $props();

  const result = useQuery(...untrack(() => params));
</script>

<span data-testid="count">
  {result.current.length}
</span>
