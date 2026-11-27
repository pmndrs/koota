import { subscribeSet } from '../command/settled';
import type { Entity } from '../entity/types';
import type { WorldContext } from '../world/types';
import { isQuery } from './query';
import { ensureInlineQuery, ensureQueryInstance } from './registry';
import type { Query, QueryInstance, QueryParameter, QuerySubscriber } from './types';

function ensureTargetQuerySubscriptions(ctx: WorldContext, query: QueryInstance) {
  const index = (ctx.targetQuerySubscriptions ??= new WeakMap());
  let subscriptions = index.get(query);
  if (subscriptions === undefined) {
    subscriptions = { add: new Set<QuerySubscriber>(), remove: new Set<QuerySubscriber>() };
    index.set(query, subscriptions);
  }
  return subscriptions;
}

/** Resolve the world’s instance for a query or an inline parameter list. */
function resolveQueryArgs(ctx: WorldContext, args: Query<QueryParameter[]> | QueryParameter[]) {
  return isQuery(args)
    ? ensureQueryInstance(ctx, args)
    : ensureInlineQuery(ctx, args as QueryParameter[]);
}

/** Attaches a callback to a query's enter or exit hook. */
function subscribeQuery(
  ctx: WorldContext,
  args: Query<QueryParameter[]> | QueryParameter[],
  callback: (entity: Entity) => void,
  added: boolean
): () => void {
  const query = resolveQueryArgs(ctx, args);
  const key = added ? 'addSubscriptions' : 'removeSubscriptions';
  return subscribeSet(ctx, (query[key] ??= new Set()), callback);
}

/** Backs onEnter. Reports entities that start matching from now on. */
export function subscribeEnter(
  ctx: WorldContext,
  args: Query<QueryParameter[]> | QueryParameter[],
  callback: (entity: Entity) => void
): () => void {
  return subscribeQuery(ctx, args, callback, true);
}

/** Backs onExit. Reports entities that stop matching from now on. */
export function subscribeExit(
  ctx: WorldContext,
  args: Query<QueryParameter[]> | QueryParameter[],
  callback: (entity: Entity) => void
): () => void {
  return subscribeQuery(ctx, args, callback, false);
}

/**
 * Follow targets entering or leaving a relation filter's target query. During a batch these
 * callbacks update source membership before public query callbacks run.
 */
export function subscribeTargetQuery(
  ctx: WorldContext,
  targetQuery: Query<QueryParameter[]>,
  callback: (entity: Entity) => void,
  added: boolean
): () => void {
  const subscriptions = ensureTargetQuerySubscriptions(ctx, ensureQueryInstance(ctx, targetQuery));
  const subscribers = added ? subscriptions.add : subscriptions.remove;
  subscribers.add(callback);
  const unsubscribe = subscribeQuery(ctx, targetQuery, callback, added);
  return () => {
    subscribers.delete(callback);
    unsubscribe();
  };
}

export function notifyQuerySubscribers(query: QueryInstance, entity: Entity, added: boolean) {
  const ctx = query.ctx;
  if (ctx.queryBatch !== undefined) /* @cold */ {
    if (query.addSubscriptions?.size || query.removeSubscriptions?.size) {
      ctx.queryBatch.push({ query, entity, added });
    }
  } else {
    const subscribers = added ? query.addSubscriptions : query.removeSubscriptions;
    if (subscribers?.size) emitQuerySubscribers(subscribers, entity);
  }
}

/** Finish derived query membership before delivering any public query callback. */
export function flushQueryBatch(ctx: WorldContext) {
  const events = ctx.queryBatch!;
  for (let i = 0; i < events.length; i++) {
    const { query, entity, added } = events[i];
    const subscriptions = ctx.targetQuerySubscriptions?.get(query);
    const targetSubscribers = added ? subscriptions?.add : subscriptions?.remove;
    if (targetSubscribers?.size) emitQuerySubscribers(targetSubscribers, entity);
  }
  ctx.queryBatch = undefined;
  if (events.length === 0) return;
  const settled = new Map<QueryInstance, Map<Entity, { first: boolean; last: boolean }>>();
  for (const { query, entity, added } of events) {
    if (query.isTracking) continue;
    let entities = settled.get(query);
    if (entities === undefined) settled.set(query, (entities = new Map()));
    const event = entities.get(entity);
    if (event === undefined) entities.set(entity, { first: added, last: added });
    else event.last = added;
  }
  for (const { query, entity, added } of events) {
    if (!query.isTracking) {
      const entities = settled.get(query)!;
      const event = entities.get(entity);
      if (event === undefined) continue;
      entities.delete(entity);
      if (event.first !== event.last) continue;
    }
    const subscribers = added ? query.addSubscriptions : query.removeSubscriptions;
    const subscriptions = ctx.targetQuerySubscriptions?.get(query);
    const targetSubscribers = added ? subscriptions?.add : subscriptions?.remove;
    if (subscribers?.size) {
      for (const subscriber of subscribers) {
        if (!targetSubscribers?.has(subscriber)) subscriber(entity);
      }
    }
  }
}

/** Out of line so the membership paths that reach it stay small. */
function emitQuerySubscribers(subscribers: Set<QuerySubscriber>, entity: Entity) {
  for (const sub of subscribers) sub(entity);
}
