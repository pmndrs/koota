<script lang="ts">
    import type { World } from '@koota/core';
    import { provideWorld, useActions } from '../../src';

    let {
        actions,
        onActions,
        onWorld,
    }: {
        actions: (world: World) => Record<string, (...args: any[]) => any>;
        onActions?: (actions: Record<string, (...args: any[]) => any>) => void;
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    const boundActions = useActions(actions);

    onWorld?.(world);
    onActions?.(boundActions);
</script>
