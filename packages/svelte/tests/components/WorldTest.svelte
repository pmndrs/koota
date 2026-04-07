<script lang="ts">
    import type { World } from '@koota/core';
    import { untrack } from 'svelte';
    import { provideWorld, useWorld } from '../../src';

    let {
        onWorld,
    }: {
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    const contextWorld = useWorld();

    untrack(() => onWorld?.(contextWorld));
</script>
