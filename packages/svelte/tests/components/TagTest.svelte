<script lang="ts">
    import type { Entity, TagTrait, World } from '@koota/core';
    import { untrack } from 'svelte';
    import { provideWorld, useTag } from '../../src';

    let {
        target,
        tag,
        onWorld,
    }: {
        target: () => Entity | World | undefined | null;
        tag: TagTrait;
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    untrack(() => onWorld?.(world));

    const result = useTag(() => target(), untrack(() => tag));
</script>

<span data-testid="value">{result.current}</span>
