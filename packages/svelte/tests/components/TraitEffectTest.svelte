<script lang="ts">
  import type {
    Entity,
    RelationPair,
    Trait,
    TraitRecord,
    World,
  } from "@koota/core";
  import { untrack } from "svelte";
  import { useTraitEffect } from "../../src";

  let {
    target,
    trait,
    callback,
  }: {
    target: Entity | World;
    trait: Trait | RelationPair;
    callback: (value: TraitRecord<Trait> | undefined) => void;
  } = $props();

  useTraitEffect(
    () => target,
    () => trait,
    untrack(() => callback),
  );
</script>
