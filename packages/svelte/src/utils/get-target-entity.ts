import { $internal as internal, type Entity, type World } from '@koota/core';
import { getProvidedWorld } from '../world/world-context.js';
import { isWorld } from './is-world.js';

type Target = Entity | World | undefined | null;

/**
 * Returns a function that resolves a target to the world it is read through and the entity to
 * read, or undefined when there is nothing live to read. An entity is a bare id, so its world
 * is the provided one, captured here during component initialization. A world target is its
 * own world and needs no context.
 */
export function createTargetResolver() {
  const provided = getProvidedWorld();

  return (target: Target): { world: World; entity: Entity } | undefined => {
    if (target == null) return undefined;
    if (isWorld(target)) {
      // A destroyed world no longer has a world entity.
      const entity = target[internal].worldEntity;
      return entity === null ? undefined : { world: target, entity };
    }
    if (!provided) {
      throw new Error('Koota: reading an entity needs provideWorld in a parent component.');
    }
    return provided.isAlive(target) ? { world: provided, entity: target } : undefined;
  };
}
