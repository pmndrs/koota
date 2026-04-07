<script lang="ts">
    import type { Entity, Relation, Trait, World } from '@koota/core';
    import { provideWorld, useTargets } from '../../src';

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
    const result = useTargets(target, relation);

    onWorld?.(world);
</script>

<span data-testid="count">{result.current.length}</span>
