import type { World } from '@koota/core';
import { getContext, setContext } from 'svelte';

export const WORLD_KEY = Symbol('koota-world');

export function provideWorld(world: World): World {
  setContext(WORLD_KEY, world);
  return world;
}

/**
 * The provided world, or undefined outside a provider. A hook called outside component
 * initialization has no context to read, which is fine as long as its target is a world.
 */
export function getProvidedWorld(): World | undefined {
  try {
    return getContext<World | undefined>(WORLD_KEY);
  } catch {
    return undefined;
  }
}

export function useWorld(): World {
  const world = getContext<World>(WORLD_KEY);

  if (!world) {
    throw new Error('Koota: useWorld must be used within a component that has called provideWorld');
  }

  return world;
}
