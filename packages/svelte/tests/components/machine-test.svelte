<script lang="ts">
  import type { Entity, Machine, Trait, World } from '@koota/core';
  import { untrack } from 'svelte';
  import { useMachine } from '../../src';

  let {
    target,
    machine,
    direct = false,
    onInitial,
    beforeEffects,
    data,
  }: {
    target: Entity | World | undefined | null;
    machine: Machine;
    direct?: boolean;
    onInitial?: (result: { readonly current: Trait | undefined }) => void;
    beforeEffects?: () => void;
    data?: (state: Trait | undefined) => unknown;
  } = $props();

  const result = useMachine(
    () => target,
    untrack(() => (direct ? machine : () => machine))
  );
  untrack(() => onInitial?.(result));
  $effect.pre(() => beforeEffects?.());
</script>

<span data-testid="state">{result.current?.id ?? 'undefined'}</span>
<span data-testid="data">{JSON.stringify(data?.(result.current)) ?? 'undefined'}</span>
