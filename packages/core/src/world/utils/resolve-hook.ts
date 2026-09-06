import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { createQuery, queryInternal } from '../../query/query';
import { isQuery } from '../../query/utils/is-query';
import type { Relation, RelationPair } from '../../relation/types';
import { isRelation, isRelationPair } from '../../relation/utils/is-relation';
import type { Subscriber } from '../../trait/subscriptions';
import type { Trait } from '../../trait/types';
import type { WorldContext } from '../types';

export type HookInput = Trait | Relation<Trait> | RelationPair<Trait>;

/** Resolve the trait that backs a hook input so subscriptions attach to one trait instance. */
export function resolveHookTrait(input: HookInput): Trait {
  if (isRelationPair(input)) return input.relation[$internal].trait;
  if (isRelation(input)) return input[$internal].trait;
  return input;
}

/** Wrap a hook callback so relation pairs only fire for their target. */
export function resolveHookCallback(
  ctx: WorldContext,
  input: HookInput,
  callback: Subscriber
): Subscriber {
  if (!isRelationPair(input)) return callback;

  const pairTargetQuery = input.targetQuery;
  if (pairTargetQuery) {
    const targetQuery = isQuery(pairTargetQuery) ? pairTargetQuery : createQuery(...pairTargetQuery);

    return (entity: Entity, target?: Entity) => {
      /**
       * @todo This should be using the same caching logic as the query system
       * instead of searching with `includes`.
       */
      if (target !== undefined && queryInternal(ctx, targetQuery).includes(target)) {
        callback(entity, target);
      }
    };
  }

  const pairTarget = input.target;
  if (pairTarget === '*') return callback;

  return (entity: Entity, target?: Entity) => {
    if (target === pairTarget) callback(entity, target);
  };
}
