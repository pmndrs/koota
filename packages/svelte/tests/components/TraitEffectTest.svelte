<script lang="ts">
    import type { Entity, RelationPair, Trait, TraitRecord, World } from '@koota/core';
    import { provideWorld, useTraitEffect } from '../../src';

    let {
        target,
        trait,
        callback,
        onWorld,
    }: {
        target: () => Entity | World;
        trait: () => Trait | RelationPair;
        callback: (value: TraitRecord | undefined) => void;
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    onWorld?.(world);

    useTraitEffect(() => target(), trait(), callback);
</script>
