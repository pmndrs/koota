import { $internal as internal, type Entity, type World } from '@koota/core';
import { useWorld } from '../world/world-context.js';
import { isWorld } from './is-world.js';

type Target = Entity | World | undefined | null;
type Resolved = { world: World; entity: Entity };
type TargetResolver = (target: Target) => Resolved | undefined;

/**
 * Returns a function that resolves a target to the world and entity to read, or undefined when
 * nothing live is there. An entity is read through the provided world, which is captured here
 * during component initialization. A world target is read through itself.
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
    return provided.has(target) ? { world: provided, entity: target } : undefined;
  };
}

/** Attach to the new world entity before notifying a trait effect. */
export function subscribeTarget(
  resolveTarget: TargetResolver,
  target: Target,
  attach: (resolved: Resolved | undefined) => (() => void) | void,
  afterReset?: () => void
) {
  if (target == null || !isWorld(target)) return attach(resolveTarget(target));
  const ctx = target[internal];
  const bind = () => attach(resolveTarget(target));
  let detach = bind();
  const reset = () => {
    detach?.();
    detach = bind();
    afterReset?.();
  };
  ctx.resetSubscriptions.add(reset);
  return () => {
    ctx.resetSubscriptions.delete(reset);
    detach?.();
  };
}
