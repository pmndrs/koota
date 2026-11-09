import { $internal as internal, type Entity, type World } from '@koota/core';
import { useWorld } from '../world/world-context.js';
import { isWorld } from './is-world.js';

type Target = Entity | World | undefined | null;
type Resolved = { world: World; entity: Entity };
type TargetResolver = (target: Target) => Resolved | undefined;

/**
 * Returns a function that resolves a target to the world it is read through and the entity to
 * read, or undefined when there is nothing live to read. Every hook needs a provided world,
 * captured here during component initialization. An entity is a bare id, so it is read through
 * the provided world. A world target is read through itself.
 */
export function createTargetResolver(): TargetResolver {
  const provided = useWorld();

  return (target) => {
    if (target == null) return undefined;
    if (isWorld(target)) {
      // A destroyed world no longer has a world entity.
      const entity = target[internal].worldEntity;
      return entity === null ? undefined : { world: target, entity };
    }
    return provided.isAlive(target) ? { world: provided, entity: target } : undefined;
  };
}

/** Calls listen with the resolved target. A world target is followed through reset and destruction. */
export function observeTarget(
  resolveTarget: TargetResolver,
  target: Target,
  listen: (resolved: Resolved | undefined) => (() => void) | void
) {
  if (target != null && isWorld(target)) {
    return target[internal].observeWorldEntity(() => listen(resolveTarget(target)));
  }
  return listen(resolveTarget(target));
}
