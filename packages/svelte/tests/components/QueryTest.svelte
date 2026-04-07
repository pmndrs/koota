<script lang="ts">
    import type { QueryParameter, World } from '@koota/core';
    import { untrack } from 'svelte';
    import { provideWorld, useQuery } from '../../src';

    let {
        params,
        onWorld,
    }: {
        params: () => QueryParameter[];
        onWorld?: (world: World) => void;
    } = $props();

    const world = provideWorld();
    untrack(() => onWorld?.(world));

    const result = useQuery(() => params());
</script>

<span data-testid="count">{result.current.length}</span>
<span data-testid="has-update-each">{typeof result.current.updateEach === 'function'}</span>
