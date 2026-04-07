<script lang="ts">
    import type { World } from '@koota/core';
    import { provideWorld, useWorld } from '../../src';

    let {
        onWorld,
    }: {
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    const contextWorld = useWorld();

    onWorld?.(contextWorld);
</script>
