<script lang="ts">
    import type { Entity, RelationPair, Trait, World } from '@koota/core';
    import { provideWorld, useTrait } from '../../src';

    let {
        target,
        trait,
        onWorld,
    }: {
        target: () => Entity | World | undefined | null;
        trait: () => Trait | RelationPair;
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    onWorld?.(world);

    const result = useTrait(() => target(), trait());
</script>

<span data-testid="value">{JSON.stringify(result.current) ?? 'undefined'}</span>
