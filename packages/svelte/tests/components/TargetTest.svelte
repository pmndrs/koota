<script lang="ts">
    import type { Entity, Relation, Trait, World } from '@koota/core';
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
    onWorld?.(world);

    const result = useTarget(() => target(), relation);
</script>

<span data-testid="value">{result.current ?? 'undefined'}</span>
