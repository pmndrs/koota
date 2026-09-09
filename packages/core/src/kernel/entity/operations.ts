import { $internal } from '../common';
import type { KernelContext } from '../context';
import { createRelation } from '../relation/create-relation';
import { createTrait } from '../trait/create-trait';
import { getTrait, registerTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import type { Relation } from '../relation/types';
import type { Schema } from '../storage';
import { removeTrait, setTrait } from '../commands/operations';
import { recordIdentity } from '../commands/recording';
import { CommandKind } from '../commands/buffer-state';
import { applyAddTrait } from '../commands/handlers/trait';
import { abortMutation, finishMutation, pendingCommands } from '../commands/lifecycle';
import { createQueryInstance } from '../query/query';
import { checkQueryWithRelations } from '../query/check-query-with-relations';
import { isEntityAlive } from './entity-index';
import { getDefinitionEntity, internRelationPair } from './definitions';
import { findMembership, reserveMemberships } from './membership';
import type { Entity } from './types';

/** Explicitly resolved definitions participate in ordinary queries and lifecycle events. */
export function exposeEntity(ctx: KernelContext, entity: Entity): Entity {
  if (ctx.mutationDepth) throw new Error('Koota: Definitions must be exposed outside mutations.');
  if (!isEntityAlive(ctx.entityIndex, entity)) throw new Error('Koota: Invalid entity identity.');
  if (ctx.implicitEntities.delete(entity)) {
    ctx.memberships.version++;
    ctx.mutationDepth++;
    try {
      for (const query of ctx.queriesHashMap.values()) {
        if (!query.isTracking && checkQueryWithRelations(ctx, query, entity)) query.add(entity);
      }
      for (const callback of ctx.entitySpawnSubscriptions) callback(entity);
    } catch (error) {
      abortMutation(ctx);
      throw error;
    }
    finishMutation(ctx);
  }
  return entity;
}

export function resolveDefinition(ctx: KernelContext, definition: Trait | Relation<Trait>): Entity {
  if (ctx.mutationDepth) throw new Error('Koota: Definitions must be created outside mutations.');
  return exposeEntity(ctx, getDefinitionEntity(ctx, definition));
}

/** Definitions and ordinary tags use exactly the same entity allocator. */
export function defineTrait(ctx: KernelContext, schema: Schema = {}): Entity {
  return resolveDefinition(ctx, createTrait(schema));
}

export function defineRelation(
  ctx: KernelContext,
  options?: Parameters<typeof createRelation>[0]
): Entity {
  return resolveDefinition(ctx, createRelation(options));
}

function resolvePredicate(ctx: KernelContext, predicate: Entity) {
  if (!isEntityAlive(ctx.entityIndex, predicate))
    throw new Error('Koota: Invalid predicate identity.');
  const pair = ctx.pairs.get(predicate);
  if (pair) return pair.descriptor;
  let definition = ctx.definitions.get(predicate);
  if (!definition) {
    if (ctx.mutationDepth) throw new Error('Koota: Predicates must be prepared outside mutations.');
    definition = registerTrait(ctx, createTrait(), predicate);
  }
  return definition.trait;
}

export function pairEntity(ctx: KernelContext, relation: Entity, target: Entity): Entity {
  if (ctx.mutationDepth) throw new Error('Koota: Pairs must be created outside mutations.');
  if (!isEntityAlive(ctx.entityIndex, relation)) throw new Error('Koota: Invalid relation identity.');
  const definition = ctx.definitions.get(relation);
  const descriptor = definition?.trait[$internal].relation;
  if (!descriptor) throw new Error('Koota: Entity is not a relation definition.');
  return exposeEntity(ctx, internRelationPair(ctx, descriptor, target));
}

/** Single-predicate mutation avoids rest arrays and configuration tuples. */
export function attachEntity(
  ctx: KernelContext,
  entity: Entity,
  predicate: Entity,
  value?: any
): boolean {
  if (
    (!isEntityAlive(ctx.entityIndex, entity) &&
      !(ctx.mutationDepth && ctx.entityIndex.reserved.has(entity))) ||
    !isEntityAlive(ctx.entityIndex, predicate)
  )
    return false;
  if (ctx.definitions.get(predicate)?.trait[$internal].relation) return false;
  const descriptor = resolvePredicate(ctx, predicate);
  if (ctx.mutationDepth > 0) {
    recordIdentity(
      pendingCommands(ctx),
      CommandKind.AttachIdentity,
      entity,
      predicate,
      descriptor,
      value
    );
    return true;
  }
  ctx.mutationDepth++;
  try {
    applyAddTrait(ctx, entity, descriptor, value);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return true;
}

export function detachEntity(ctx: KernelContext, entity: Entity, predicate: Entity): boolean {
  if (ctx.mutationDepth > 0) {
    const descriptor = ctx.pairs.get(predicate)?.descriptor ?? ctx.definitions.get(predicate)?.trait;
    if (
      !descriptor ||
      (!isEntityAlive(ctx.entityIndex, entity) && !ctx.entityIndex.reserved.has(entity))
    )
      return false;
    recordIdentity(pendingCommands(ctx), CommandKind.DetachIdentity, entity, predicate, descriptor);
    return true;
  }
  if (!hasEntityTrait(ctx, entity, predicate)) return false;
  removeTrait(ctx, entity, resolvePredicate(ctx, predicate));
  return true;
}

export function hasEntityTrait(ctx: KernelContext, entity: Entity, predicate: Entity): boolean {
  return (
    isEntityAlive(ctx.entityIndex, entity) &&
    isEntityAlive(ctx.entityIndex, predicate) &&
    findMembership(ctx.memberships, entity, predicate) !== 0
  );
}

export function readEntityTrait(ctx: KernelContext, entity: Entity, predicate: Entity): any {
  if (!hasEntityTrait(ctx, entity, predicate)) return undefined;
  if (ctx.definitions.get(predicate)?.trait[$internal].relation) return undefined;
  return getTrait(ctx, entity, resolvePredicate(ctx, predicate));
}

export function writeEntityTrait(
  ctx: KernelContext,
  entity: Entity,
  predicate: Entity,
  value: any
): boolean {
  if (ctx.definitions.get(predicate)?.trait[$internal].relation) return false;
  if (ctx.mutationDepth > 0) {
    const descriptor = ctx.pairs.get(predicate)?.descriptor ?? ctx.definitions.get(predicate)?.trait;
    if (
      !descriptor ||
      (!isEntityAlive(ctx.entityIndex, entity) && !ctx.entityIndex.reserved.has(entity))
    )
      return false;
    recordIdentity(
      pendingCommands(ctx),
      CommandKind.WriteIdentity,
      entity,
      predicate,
      descriptor,
      value
    );
    return true;
  }
  if (!hasEntityTrait(ctx, entity, predicate)) return false;
  setTrait(ctx, entity, resolvePredicate(ctx, predicate), value);
  return true;
}

/** Compile numeric predicates once, then reuse the existing query handle. */
export function selectEntities(ctx: KernelContext, predicates: readonly Entity[]) {
  const hash = 'entities:' + predicates.join(',');
  let query = ctx.queriesHashMap.get(hash);
  if (!query)
    query = createQueryInstance(
      ctx,
      predicates.map((predicate) => resolvePredicate(ctx, predicate)),
      predicates.slice()
    );
  return query;
}

export function reserveEntityMemberships(ctx: KernelContext, capacity: number): void {
  reserveMemberships(ctx.memberships, capacity);
}
