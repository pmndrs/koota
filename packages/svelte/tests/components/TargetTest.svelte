<script lang="ts">
  import type { Entity, Relation, Trait, World } from "@koota/core";
  import { useTarget } from "../../src";

  let {
    target,
    relation,
  }: {
    target: Entity | World | undefined | null;
    relation: Relation<Trait>;
  } = $props();

  const result = useTarget(
    () => target,
    () => relation,
  );
</script>

<span data-testid="value">{result.current ?? "undefined"}</span>
