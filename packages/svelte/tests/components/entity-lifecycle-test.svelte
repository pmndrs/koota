<script lang="ts">
  import type { Entity, Trait, World } from '@koota/core';
  import { provideWorld, useTrait, useTraitEffect } from '../../src';

  let {
    world,
    target,
    trait,
    beforeEffects,
    onChange,
  }: {
    world: World;
    target: Entity;
    trait: Trait;
    beforeEffects?: () => void;
    onChange: (value: unknown) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  provideWorld(world);

  const result = useTrait(
    () => target,
    () => trait
  );
  useTraitEffect(
    () => target,
    () => trait,
    (value) => onChange(value)
  );

  $effect.pre(() => {
    beforeEffects?.();
  });
</script>

<span data-testid="value">{JSON.stringify(result.current) ?? 'undefined'}</span>
