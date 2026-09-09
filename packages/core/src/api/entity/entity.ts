import {
  $internal,
  getEntityId,
  getRelationTargets,
  getTraitInstance,
  hasRelationPair,
  hasTrait,
  hasTraitInstance,
  isEntityAlive,
  isRelationPair,
  queryInternal,
  registerTrait,
  subscribeEntity,
  universe,
  type KernelContext,
} from '../../kernel';
import type { RelationPair } from '../relation/types';
import type { Trait } from '../trait/types';
import { resolveHookCallback, resolveHookTrait, type HookInput } from '../world/resolve-hook';
import type { Entity } from './types';

/** Resolve KernelContext directly from pageOwners. Used by entity methods. */
export function getEntityContext(entity: Entity): KernelContext {
  return universe.pageOwners[getEntityId(entity) >>> 10]!;
}

export function entityHas(ctx: KernelContext, entity: Entity, trait: Trait | RelationPair): boolean {
  if (!isRelationPair(trait)) return hasTrait(ctx, entity, trait);
  if (!hasTrait(ctx, entity, trait.relation[$internal].trait)) return false;
  if (trait.targetQuery) {
    const targets = getRelationTargets(ctx, trait.relation, entity);
    return queryInternal(ctx, ...(trait.targetQuery as any)).some((match) => targets.includes(match));
  }
  return hasRelationPair(ctx, entity, trait);
}

/**
 * Subscribe to a trait event for one entity. The instance is indexed on the
 * world so destroy only visits traits that hold entity subscribers.
 * A dead handle registers nothing, since its id may already belong to another entity.
 */
export function subscribeEntityEvent(
  ctx: KernelContext,
  entity: Entity,
  event: 'addSubscriptions' | 'removeSubscriptions' | 'changeSubscriptions',
  input: HookInput,
  callback: (entity: Entity, target?: Entity) => void
) {
  if (!isEntityAlive(ctx.entityIndex, entity)) return () => {};
  const trait = resolveHookTrait(input);
  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  ctx.entitySubscribedInstances.add(instance);
  return subscribeEntity(instance[event], entity, resolveHookCallback(ctx, input, callback));
}
