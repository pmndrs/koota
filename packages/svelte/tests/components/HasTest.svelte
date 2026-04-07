<script lang="ts">
  import type { Entity, RelationPair, Trait, World } from "@koota/core";
  import { useHas } from "../../src";

  let {
    target,
    trait,
  }: {
    target: Entity | World | undefined | null;
    trait: Trait | RelationPair;
  } = $props();

  const result = useHas(
    () => target,
    () => trait,
  );
</script>

<span data-testid="value">{result.current}</span>
