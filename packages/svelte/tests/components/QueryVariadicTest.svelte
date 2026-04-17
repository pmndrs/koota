<script lang="ts">
  import type { QueryParameter } from "@koota/core";
  import { useQuery } from "../../src";

  let { params }: { params: QueryParameter[] } = $props();

  const result = useQuery(...params);
</script>

<span data-testid="count">
  {result.current.length}
</span>
