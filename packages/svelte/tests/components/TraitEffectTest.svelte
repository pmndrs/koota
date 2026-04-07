<script lang="ts">
    import type { Entity, RelationPair, Trait, TraitRecord, World } from '@koota/core';
    import { untrack } from 'svelte';
    import { provideWorld, useTraitEffect } from '../../src';

    let {
        target,
        trait,
        callback,
        onWorld,
    }: {
        target: () => Entity | World;
        trait: () => Trait | RelationPair;
        callback: (value: TraitRecord<Trait> | undefined) => void;
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    untrack(() => onWorld?.(world));

    useTraitEffect(() => target(), untrack(() => trait()), untrack(() => callback));
</script>
