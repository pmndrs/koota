<script lang="ts">
  import type { Entity, Trait } from '@koota/core';
  import { useTrait, useTraitEffect } from '../../src';

  let {
    target,
    trait,
    beforeEffects,
    onChange,
  }: {
    target: Entity;
    trait: Trait;
    beforeEffects?: () => void;
    onChange: (value: unknown) => void;
  } = $props();

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
