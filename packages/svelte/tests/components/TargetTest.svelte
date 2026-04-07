<script lang="ts">
    import type { Entity, Relation, Trait, World } from '@koota/core';
    import { untrack } from 'svelte';
    import { provideWorld, useTarget } from '../../src';

    let {
        target,
        relation,
        onWorld,
    }: {
        target: () => Entity | World | undefined | null;
        relation: Relation<Trait>;
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    untrack(() => onWorld?.(world));

    const result = useTarget(() => target(), untrack(() => relation));
</script>

<span data-testid="value">{result.current ?? 'undefined'}</span>
