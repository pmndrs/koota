import { $internal } from '../common';
import type { KernelContext } from '../context';
import { $relationPair } from '../relation/symbols';
import type { Relation, RelationPair } from '../relation/types';
import { getTraitInstance, registerTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { allocateEntity, isEntityAlive } from './entity-index';
import { prepareMembershipEntity } from './membership';
import type { Entity } from './types';

export type PairRecord = {
  entity: Entity;
  relation: Relation<Trait>;
  target: Entity;
  descriptor: RelationPair;
  next: PairRecord | null;
  previous: PairRecord | null;
};

/** Shared schemas acquire an ordinary, context-owned identity on first use. */
export function getDefinitionEntity(ctx: KernelContext, definition: Trait | Relation<Trait>): Entity {
  const trait =
    'trait' in definition[$internal]
      ? (definition as Relation<Trait>)[$internal].trait
      : (definition as Trait);
  let instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance || instance.entity < 0) instance = registerTrait(ctx, trait);
  return instance.entity;
}

/** Pair identities persist when unused and are invalidated with either endpoint. */
export function internRelationPair(
  ctx: KernelContext,
  relation: Relation<Trait>,
  target: Entity
): Entity {
  if (!isEntityAlive(ctx.entityIndex, target)) throw new Error('Koota: Invalid relation target.');
  const definition = getDefinitionEntity(ctx, relation);
  const instance = ctx.definitions.get(definition)!;
  const existing = instance.pairs.get(target);
  if (existing !== undefined) return existing;
  const entity = allocateEntity(ctx.entityIndex);
  prepareMembershipEntity(ctx.memberships, entity);
  const next = ctx.targetPairs.get(target) ?? null;
  const record: PairRecord = {
    entity,
    relation,
    target,
    descriptor: {
      [$relationPair]: true,
      relation,
      target,
      targetQuery: undefined,
      params: undefined,
    },
    next,
    previous: null,
  };
  if (next) next.previous = record;
  ctx.targetPairs.set(target, record);
  ctx.pairs.set(entity, record);
  instance.pairs.set(target, entity);
  ctx.implicitEntities.add(entity);
  return entity;
}

export function forgetRelationPair(ctx: KernelContext, record: PairRecord): void {
  if (record.previous) record.previous.next = record.next;
  else if (record.next) ctx.targetPairs.set(record.target, record.next);
  else ctx.targetPairs.delete(record.target);
  if (record.next) record.next.previous = record.previous;
  getTraitInstance(ctx.traitInstances, record.relation[$internal].trait)?.pairs.delete(record.target);
  ctx.pairs.delete(record.entity);
}
