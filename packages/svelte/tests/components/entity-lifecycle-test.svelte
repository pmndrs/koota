<script lang="ts">
  import type { Entity } from '@koota/core';
  import { untrack } from 'svelte';

  let {
    target,
    bind,
    beforeEffects,
    onInitial,
  }: {
    target: Entity;
    bind: (target: () => Entity) => { readonly current: unknown } | undefined;
    beforeEffects?: () => void;
    onInitial?: (value: unknown) => void;
  } = $props();

  const result = untrack(() => bind)(() => target);
  untrack(() => onInitial?.(result?.current));

  $effect.pre(() => {
    beforeEffects?.();
  });
</script>

<span data-testid="value">{JSON.stringify(result?.current) ?? 'undefined'}</span>
