import { $internal } from '../../common';
import { isIdentifierPair } from '../../identifier/identifier';
import type { Identifier, IdentifierPair } from '../../identifier/types';
import type { Entity } from '../../entity/types';
import { createQuery, queryInternal } from '../../query/query';
import { isQuery } from '../../query/utils/is-query';
import type { Relation, RelationPair } from '../../relation/types';
import { isRelationPair } from '../../relation/utils/is-relation';
import { resolveTrait } from '../../trait/resolve-trait';
import type { Subscriber } from '../../trait/subscriptions';
import type { Trait } from '../../trait/types';
import type { WorldContext } from '../types';

export type HookInput = Trait | Relation<Trait> | RelationPair<Trait> | Identifier | IdentifierPair;

/** Resolve the trait that backs a hook input so subscriptions attach to one trait instance. */
export function resolveHookTrait(input: HookInput): Trait {
  if (isIdentifierPair(input)) return input.identifier[$internal].trait;
  if (isRelationPair(input)) return input.relation[$internal].trait;
  return resolveTrait(input);
}

/** Exact terms filter by key or target. A relation wildcard observes every target. */
export function resolveHookCallback(
  ctx: WorldContext,
  input: HookInput,
  callback: Subscriber<any>
): Subscriber<any> {
  if (isIdentifierPair(input)) {
    return (entity, target) => {
      if (target === input.target) callback(entity, target);
    };
  }
  if (!isRelationPair(input)) return callback;

  const pairTargetQuery = input.targetQuery;
  if (pairTargetQuery) {
    const targetQuery = isQuery(pairTargetQuery) ? pairTargetQuery : createQuery(...pairTargetQuery);

    return (entity: Entity, target?: Entity) => {
      /**
       * @todo This should be using the same caching logic as the query system
       * instead of searching with `includes`.
       */
      if (target === undefined) return;
      for (const match of queryInternal(ctx, targetQuery)) {
        if (match === target) {
          callback(entity, target);
          return;
        }
      }
    };
  }

  const pairTarget = input.target;
  if (pairTarget === '*') return callback;

  return (entity: Entity, target?: Entity) => {
    if (target === pairTarget) callback(entity, target);
  };
}
