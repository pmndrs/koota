<script lang="ts">
  import { useQuery } from "../../src";

  let { params } = $props();

  const result = useQuery(() => params);
</script>

<span data-testid="count">
  {result.current.length}
</span>

<span data-testid="has-update-each">
  {typeof result.current.updateEach === "function"}
</span>
