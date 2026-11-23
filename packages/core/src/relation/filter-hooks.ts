import type { Entity } from '../entity/types';
import { createQuery, subscribeTargetQuery } from '../query/query';
import type { QueryParameter } from '../query/types';
import { isQuery } from '../query/utils/is-query';
import {
  createSubscriptions,
  emit,
  subscribeAll,
  subscribeEntity,
  type Subscriber,
  type Subscriptions,
} from '../trait/subscriptions';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import { getEntitiesWithRelationTo } from './relation';
import type { QueryRelationPair, Relation } from './types';

export type RelationFilterHooks = {
  added: Subscriptions;
  removed: Subscriptions;
  stop: () => void;
};

/**
 * The hooks of one relation filter in one world. An entity holds the filter's pair while one of
 * its targets matches the filter, so a target entering or leaving the filter adds or removes
 * that pair for every source of the target. A pair added to or removed from the entity itself
 * reaches the same subscribers through the relation's own subscriptions.
 */
function ensureRelationFilterHooks(
  ctx: WorldContext,
  instance: TraitInstance,
  pair: QueryRelationPair
): RelationFilterHooks {
  const index = (instance.relationFilterHooks ??= new Map());
  let hooks = index.get(pair);
  if (hooks !== undefined) return hooks;

  const filter = pair.targetQuery;
  const ref = isQuery(filter) ? filter : createQuery(...(filter as QueryParameter[]));
  const added = createSubscriptions();
  const removed = createSubscriptions();
  // The filter reports a target once as it enters and once as it leaves.
  const notify = (subs: Subscriptions, target: Entity) => {
    const sources = getEntitiesWithRelationTo(ctx, pair.relation as Relation<Trait>, target);
    for (let i = 0; i < sources.length; i++) emit(subs, sources[i], target);
  };
  const stopEnter = subscribeTargetQuery(ctx, ref, (target) => notify(added, target), true);
  const stopExit = subscribeTargetQuery(ctx, ref, (target) => notify(removed, target), false);

  hooks = {
    added,
    removed,
    stop: () => {
      stopEnter();
      stopExit();
    },
  };
  index.set(pair, hooks);
  return hooks;
}

/**
 * Subscribe to a relation filter's pair being added or removed by its target entering or leaving
 * the filter. With an entity, only that entity's pairs are reported.
 */
export function subscribeRelationFilter(
  ctx: WorldContext,
  instance: TraitInstance,
  pair: QueryRelationPair,
  added: boolean,
  callback: Subscriber<any>,
  entity?: Entity
): () => void {
  const hooks = ensureRelationFilterHooks(ctx, instance, pair);
  const subs = added ? hooks.added : hooks.removed;
  const unsubscribe =
    entity === undefined
      ? subscribeAll(subs, callback)
      : subscribeEntity(subs, ctx.entityIndex, entity, callback);
  return () => {
    unsubscribe();
    const index = instance.relationFilterHooks!;
    if (hooks.added.count === 0 && hooks.removed.count === 0 && index.get(pair) === hooks) {
      hooks.stop();
      index.delete(pair);
    }
  };
}
