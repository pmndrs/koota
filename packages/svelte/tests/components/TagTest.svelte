<script lang="ts">
    import type { Entity, TagTrait, World } from '@koota/core';
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
    onWorld?.(world);

    const result = useTag(() => target(), tag);
</script>

<span data-testid="value">{result.current}</span>
