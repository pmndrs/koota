<script lang="ts">
  import type { Entity, Relation, Trait, World } from "@koota/core";
  import { useTargets } from "../../src";

  let {
    target,
    relation,
  }: {
    target: Entity | World | undefined | null;
    relation: Relation<Trait>;
  } = $props();

  const result = useTargets(
    () => target,
    () => relation,
  );
</script>

<span data-testid="count">{result.current.length}</span>
