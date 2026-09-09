import type { RelationPair } from '../relation/types';
import { getEntitiesWithRelationTo } from '../relation/relation';
import { hasTrait, getTraitInstance } from '../trait/trait';
import { $internal } from '../common';
import { findMembership } from '../entity/membership';
import type { KernelContext } from '../context';
import { isQuery } from './is-query';
import { resolveQueryInstance, resolveQueryInstanceFromRef } from './query';
import type { Query, QueryInstance, QueryParameter, QuerySubscriber } from './types';

export function resolveQuery(ctx: KernelContext, input: Query | QueryParameter[]): QueryInstance {
  return isQuery(input) ? resolveQueryInstanceFromRef(ctx, input) : resolveQueryInstance(ctx, input);
}

export function findQueryVersion(ctx: KernelContext, input: Query): number | undefined {
  return (ctx.queryInstances[input.id] ?? ctx.queriesHashMap.get(input.hash))?.version;
}

export function getQueryVersion(query: QueryInstance): number {
  return query.version;
}

export function isTrackingQuery(query: QueryInstance): boolean {
  return query.isTracking;
}

/** User subscriptions publish at the mutation boundary after engine indexes are updated. */
export function subscribeQuery(
  ctx: KernelContext,
  input: Query | QueryParameter[],
  event: 'add' | 'remove',
  callback: QuerySubscriber
): () => void {
  const query = resolveQuery(ctx, input);
  const subscriptions = event === 'add' ? query.addSubscriptions : query.removeSubscriptions;
  subscriptions.add(callback);
  return () => subscriptions.delete(callback);
}

/** Snapshot the reverse relation index using the context's normal exclusion rules. */
export function queryRelation(ctx: KernelContext, pair: RelationPair): number[] {
  const entities = getEntitiesWithRelationTo(ctx, pair.relation, pair.target as number) as number[];
  if (entities.length === 0) return entities;
  const exclusions = ctx.queryExclusions;
  let filterImplicit = ctx.implicitEntities.size > 0;
  // Probe the smaller hidden set before filtering a large visible result.
  if (filterImplicit && ctx.implicitEntities.size < entities.length) {
    const predicate = getTraitInstance(ctx.traitInstances, pair.relation[$internal].trait)!.pairs.get(
      pair.target as number
    )!;
    filterImplicit = false;
    for (const entity of ctx.implicitEntities) {
      if (findMembership(ctx.memberships, entity, predicate)) {
        filterImplicit = true;
        break;
      }
    }
  }
  if (!filterImplicit && !exclusions?.length) return entities;
  let write = 0;
  for (let i = 0; i < entities.length; i++) {
    if (filterImplicit && ctx.implicitEntities.has(entities[i])) continue;
    let excluded = false;
    for (let j = 0; exclusions && j < exclusions.length; j++) {
      const trait = exclusions[j];
      if (hasTrait(ctx, entities[i], trait)) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;
    entities[write++] = entities[i];
  }
  entities.length = write;
  return entities;
}
