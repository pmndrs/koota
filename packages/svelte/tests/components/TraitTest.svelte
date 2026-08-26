<script lang="ts">
  import type { Entity, RelationPair, Trait, World } from "@koota/core";
  import { untrack } from "svelte";
  import { useTrait } from "../../src";

  let {
    target,
    trait,
    onInitial,
  }: {
    target: Entity | World | undefined | null;
    trait: Trait | RelationPair;
    onWorld?: (world: World) => void;
    onInitial?: (value: unknown) => void;
  } = $props();

  const result = useTrait(
    () => target,
    () => trait,
  );

  untrack(() => onInitial)?.(result.current);
</script>

<span data-testid="value">{JSON.stringify(result.current) ?? "undefined"}</span>
