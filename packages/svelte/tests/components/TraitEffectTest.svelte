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

  const onChange = untrack(() => callback);
  let dependency = $state(0);

  useTraitEffect(
    () => target,
    () => trait,
    (value) => {
      void dependency;
      onChange(value);
    },
  );
</script>

<button data-testid="dependency" onclick={() => dependency++}>dependency</button>
