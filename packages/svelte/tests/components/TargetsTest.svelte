<script lang="ts">
  import type { Entity, Relation, Trait, World } from "@koota/core";
  import { useTargets } from "../../src";

  let {
    target,
    relation,
    onEffect,
  }: {
    target: Entity | World | undefined | null;
    relation: Relation<Trait>;
    onEffect?: () => void;
  } = $props();

  const result = useTargets(
    () => target,
    () => relation,
  );

  // Runs test mutations from inside a component effect.
  $effect(() => {
    onEffect?.();
  });
</script>

<span data-testid="count">{result.current.length}</span>
