import type { World } from '@koota/core';
import { getContext, setContext } from 'svelte';

export const WORLD_KEY = Symbol('koota-world');

export function provideWorld(world: World): World {
    setContext(WORLD_KEY, world);
    return world;
}

export function useWorld(): World {
    const world = getContext<World>(WORLD_KEY);

    if (!world) {
        throw new Error(
            'Koota: useWorld must be used within a component that has called provideWorld'
        );
    }

    return world;
}
