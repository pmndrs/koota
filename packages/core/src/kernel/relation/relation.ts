import { hasSparse, type SparseSet } from '../entity/entity-set';
import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/entity-index';
import { internRelationPair } from '../entity/definitions';
import {
  eraseMembership,
  findMembership,
  firstMembership,
  firstUser,
  insertMembership,
  reserveMemberships,
} from '../entity/membership';
import { checkQueryWithRelations } from '../query/check-query-with-relations';
import { hasTrait, getTraitInstance } from '../trait/trait';
import type { Trait } from '../trait/types';
import type { KernelContext } from '../context';
import type { Relation, RelationPair } from './types';

export function getRelationTargets(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity
): readonly Entity[] {
  const result: Entity[] = [];
  if (!ctx || !isEntityAlive(ctx.entityIndex, entity)) return result;
  const edges = ctx.memberships;
  for (let edge = firstMembership(edges, entity); edge; edge = edges.next[edge]) {
    const pair = ctx.pairs.get(edges.predicates[edge]);
    if (pair?.relation === relation) result.push(pair.target);
  }
  return result;
}

export function getFirstRelationTarget(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity
): Entity | undefined {
  if (!ctx || !isEntityAlive(ctx.entityIndex, entity)) return undefined;
  const edges = ctx.memberships;
  for (let edge = firstMembership(edges, entity); edge; edge = edges.next[edge]) {
    const pair = ctx.pairs.get(edges.predicates[edge]);
    if (pair?.relation === relation) return pair.target;
  }
  return undefined;
}

/** The stable membership slot is also the relation data row. */
export function getTargetIndex(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const pair = getTraitInstance(ctx.traitInstances, relation[$internal].trait)?.pairs.get(target);
  if (pair === undefined) return -1;
  const edge = findMembership(ctx.memberships, entity, pair);
  return edge === 0 ? -1 : edge;
}

export function hasRelationToTarget(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): boolean {
  return getTargetIndex(ctx, relation, entity, target) !== -1;
}

export function addRelationTarget(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  if (!isEntityAlive(ctx.entityIndex, target)) return -1;
  const pair = internRelationPair(ctx, relation, target);
  const edges = ctx.memberships;
  if (findMembership(edges, entity, pair)) return -1;
  if (edges.count === edges.capacity) reserveMemberships(edges, Math.max(256, edges.capacity * 2));
  const edge = insertMembership(edges, entity, pair);
  getTraitInstance(ctx.traitInstances, relation[$internal].trait)!.version++;
  updateQueriesForRelationChange(ctx, relation, entity);
  return edge;
}

/** Zero means absent, one removed, two removed the last target. */
export function removeRelationTarget(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const edge = getTargetIndex(ctx, relation, entity, target);
  if (edge === -1) return 0;
  const data = getTraitInstance(ctx.traitInstances, relation[$internal].trait)!;
  relation[$internal].trait[$internal].clear(edge, data.store);
  eraseMembership(ctx.memberships, edge);
  data.version++;
  updateQueriesForRelationChange(ctx, relation, entity);
  return getFirstRelationTarget(ctx, relation, entity) === undefined ? 2 : 1;
}

function updateQueriesForRelationChange(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity
): void {
  const data = getTraitInstance(ctx.traitInstances, relation[$internal].trait)!;
  for (const query of data.relationQueries) {
    if (checkQueryWithRelations(ctx, query, entity)) query.add(entity);
    else query.remove(ctx, entity);
  }
}

export function removeAllRelationTargets(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity
): void {
  let target = getFirstRelationTarget(ctx, relation, entity);
  while (target !== undefined) {
    removeRelationTarget(ctx, relation, entity, target);
    target = getFirstRelationTarget(ctx, relation, entity);
  }
}

export function getEntitiesWithRelationTo(
  ctx: KernelContext,
  relation: Relation<Trait>,
  target: Entity
): readonly Entity[] {
  const result: Entity[] = [];
  const pair = getTraitInstance(ctx.traitInstances, relation[$internal].trait)?.pairs.get(target);
  if (pair === undefined) return result;
  const edges = ctx.memberships;
  for (let edge = firstUser(edges, pair); edge; edge = edges.nextUser[edge])
    result.push(edges.subjects[edge]);
  return result;
}

export function hasRelationTargetInSet(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity,
  matches: SparseSet
): boolean {
  const edges = ctx.memberships;
  for (let edge = firstMembership(edges, entity); edge; edge = edges.next[edge]) {
    const pair = ctx.pairs.get(edges.predicates[edge]);
    if (pair?.relation === relation && hasSparse(matches, pair.target)) return true;
  }
  return false;
}

export function setRelationDataAtIndex(
  ctx: KernelContext,
  _entity: Entity,
  relation: Relation<Trait>,
  targetIndex: number,
  value: any
): void {
  const trait = relation[$internal].trait;
  const data = getTraitInstance(ctx.traitInstances, trait)!;
  data.version++;
  trait[$internal].set(targetIndex, data.store, value);
}

export function setRelationData(
  ctx: KernelContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity,
  value: any
): void {
  const edge = getTargetIndex(ctx, relation, entity, target);
  if (edge !== -1) setRelationDataAtIndex(ctx, entity, relation, edge, value);
}

export function getRelationData(
  ctx: KernelContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity
): unknown {
  const edge = getTargetIndex(ctx, relation, entity, target);
  if (edge === -1) return undefined;
  const trait = relation[$internal].trait;
  return trait[$internal].get(edge, getTraitInstance(ctx.traitInstances, trait)!.store);
}

export function hasRelationPair(ctx: KernelContext, entity: Entity, pair: RelationPair): boolean {
  if (!hasTrait(ctx, entity, pair.relation[$internal].trait)) return false;
  if (pair.target === '*') return true;
  return (
    typeof pair.target === 'number' && hasRelationToTarget(ctx, pair.relation, entity, pair.target)
  );
}
