import {
  $internal,
  createQuery,
  isQuery,
  isRelation,
  isRelationPair,
  queryInternal,
  type KernelContext,
  type Subscriber,
} from '../../kernel';
import type { Entity } from '../entity/types';
import type { Relation, RelationPair } from '../relation/types';
import type { Trait } from '../trait/types';

export type HookInput = Trait | Relation<Trait> | RelationPair<Trait>;

/** Resolve the trait that backs a hook input so subscriptions attach to one trait instance. */
export function resolveHookTrait(input: HookInput): Trait {
  if (isRelationPair(input)) return input.relation[$internal].trait;
  if (isRelation(input)) return input[$internal].trait;
  return input;
}

/** Wrap a hook callback so relation pairs only fire for their target. */
export function resolveHookCallback(
  ctx: KernelContext,
  input: HookInput,
  callback: (entity: Entity, target?: Entity) => void
): Subscriber {
  if (!isRelationPair(input)) return callback as Subscriber;

  const pairTargetQuery = input.targetQuery;
  if (pairTargetQuery) {
    const targetQuery = isQuery(pairTargetQuery) ? pairTargetQuery : createQuery(...pairTargetQuery);

    return (entity, target) => {
      /**
       * @todo This should be using the same caching logic as the query system
       * instead of searching with `includes`.
       */
      if (target !== undefined && queryInternal(ctx, targetQuery).includes(target)) {
        callback(entity as Entity, target as Entity | undefined);
      }
    };
  }

  const pairTarget = input.target;
  if (pairTarget === '*') return callback as Subscriber;

  return (entity, target) => {
    if (target === pairTarget) callback(entity as Entity, target as Entity | undefined);
  };
}
