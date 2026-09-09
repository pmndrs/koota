import { $internal } from '../common';
import type { KernelContext } from '../context';
import type { PreparedAccess as AccessHandle } from '../handles';
import type { TraitInstance } from '../trait/types';
import type { ValueBuffer } from '../storage/values';
import { getTraitInstance } from '../trait/trait';
import {
  addRelationPair,
  applyAddPreparedTrait,
  applyRemovePreparedTrait,
  applyRemoveTrait,
} from '../commands/handlers/trait';
import { publishChanged } from '../commands/handlers/changed';
import { abortMutation, finishMutation } from '../commands/lifecycle';
import { EMPTY_MASK_PAGE } from './paged-mask';
import { isEntityAlive } from './entity-index';
import { getEntityId } from './pack-entity';
import { findMembership } from './membership';
import type { PairRecord } from './definitions';
import type { Entity } from './types';

/** Field columns follow schema order. A reference-valued trait has one column. */
export type ValueColumn = any[][];

export type PreparedAccess = AccessHandle & {
  ctx: KernelContext;
  predicate: Entity;
  /** 0 is an ordinary trait, 1 a concrete pair, 2 an aggregate relation. */
  kind: 0 | 1 | 2;
  pair: PairRecord | null;
  instance: TraitInstance;
  definition: TraitInstance['trait'][typeof $internal];
  masks: Uint32Array[];
  columns: ValueColumn[];
  fieldCount: number;
};

export function prepareEntityAccess(ctx: KernelContext, predicate: Entity): PreparedAccess {
  if (ctx.mutationDepth) throw new Error('Koota: Access must be prepared outside mutations.');
  if (!isEntityAlive(ctx.entityIndex, predicate))
    throw new Error('Koota: Invalid predicate identity.');
  const existing = ctx.preparedAccesses.get(predicate);
  if (existing) return existing;
  const pair = ctx.pairs.get(predicate) ?? null;
  const instance = pair
    ? getTraitInstance(ctx.traitInstances, pair.relation[$internal].trait)
    : ctx.definitions.get(predicate);
  if (!instance) throw new Error('Koota: Predicate must be defined before preparing access.');
  const definition = instance.trait[$internal];
  const columns: ValueColumn[] = [];
  if (definition.type === 'aos') columns[0] = instance.store as ValueColumn;
  else {
    const keys = Object.keys(definition.schema);
    for (let i = 0; i < keys.length; i++)
      columns[i] = (instance.store as Record<string, ValueColumn>)[keys[i]];
  }
  const access: PreparedAccess = {
    ctx,
    predicate,
    kind: pair ? 1 : definition.relation ? 2 : 0,
    pair,
    instance,
    definition,
    masks: ctx.entityMasks[instance.generationId],
    columns,
    fieldCount: definition.fieldCount,
  } satisfies Omit<PreparedAccess, keyof AccessHandle> as unknown as PreparedAccess;
  ctx.preparedAccesses.set(predicate, access);
  return access;
}

/** The caller holds a borrow or has already validated both identities. */
export function preparedRow(access: PreparedAccess, entity: Entity): number {
  if (access.kind === 1) {
    const edge = findMembership(access.ctx.memberships, entity, access.predicate);
    return edge || -1;
  }
  const id = getEntityId(entity);
  return access.masks[id >>> 10][id & 1023] & access.instance.bitflag ? id : -1;
}

export function hasPreparedTrait(access: PreparedAccess, entity: Entity): boolean {
  const index = access.ctx.entityIndex;
  return (
    isEntityAlive(index, access.predicate) &&
    isEntityAlive(index, entity) &&
    preparedRow(access, entity) >= 0
  );
}

export function readPreparedValues(
  access: PreparedAccess,
  entity: Entity,
  output: ValueBuffer
): number {
  const index = access.ctx.entityIndex;
  if (access.kind === 2 || !isEntityAlive(index, access.predicate) || !isEntityAlive(index, entity))
    return -1;
  const row = preparedRow(access, entity);
  if (row < 0) return -1;
  access.definition.readValues(row, access.instance.store, output);
  return access.fieldCount;
}

export function writePreparedValues(
  access: PreparedAccess,
  entity: Entity,
  input: ValueBuffer
): boolean {
  const ctx = access.ctx;
  if (
    ctx.mutationDepth > ctx.iterationDepth ||
    access.kind === 2 ||
    input.length < access.fieldCount ||
    !isEntityAlive(ctx.entityIndex, access.predicate) ||
    !isEntityAlive(ctx.entityIndex, entity)
  )
    return false;
  const row = preparedRow(access, entity);
  if (row < 0) return false;
  ctx.mutationDepth++;
  try {
    access.definition.writeValues(row, access.instance.store, input);
    publishChanged(ctx, entity, access.instance, access.pair?.target);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return true;
}

/** Includes the relation-presence membership when attaching the first concrete pair. */
export function attachmentSize(access: PreparedAccess, entity: Entity): number {
  if (!access.pair) return 1;
  const id = getEntityId(entity);
  return access.masks[id >>> 10][id & 1023] & access.instance.bitflag ? 1 : 2;
}

export function attachmentPrepared(
  access: PreparedAccess,
  entity: Entity,
  required: number
): boolean {
  const id = getEntityId(entity);
  if (access.masks[id >>> 10] === EMPTY_MASK_PAGE) return false;
  let row = id;
  if (access.pair) {
    const edges = access.ctx.memberships;
    row = edges.free || edges.cursor;
    if (required === 2) row = edges.free ? edges.next[edges.free] || edges.cursor : edges.cursor + 1;
  }
  for (let i = 0; i < access.columns.length; i++) if (!access.columns[i][row >>> 10]) return false;
  return true;
}

export function applyPreparedAttachment(access: PreparedAccess, entity: Entity, value?: any): void {
  if (access.pair) addRelationPair(access.ctx, entity, access.pair.descriptor, value);
  else applyAddPreparedTrait(access.ctx, entity, access.instance, value);
}

/** 1 added, 0 already present, -1 capacity or storage, -2 invalid or nested. */
export function tryAttachPrepared(access: PreparedAccess, entity: Entity, value?: any): number {
  const ctx = access.ctx;
  if (
    ctx.mutationDepth ||
    access.kind === 2 ||
    !isEntityAlive(ctx.entityIndex, access.predicate) ||
    !isEntityAlive(ctx.entityIndex, entity)
  )
    return -2;
  if (preparedRow(access, entity) >= 0) return 0;
  const required = attachmentSize(access, entity);
  if (
    ctx.memberships.capacity - ctx.memberships.count < required ||
    !attachmentPrepared(access, entity, required)
  )
    return -1;
  ctx.mutationDepth++;
  try {
    applyPreparedAttachment(access, entity, value);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return 1;
}

/** Prepared immediate operations reject nesting. Use deferred identity operations in a borrow. */
export function detachPrepared(access: PreparedAccess, entity: Entity): boolean {
  const ctx = access.ctx;
  if (ctx.mutationDepth || access.kind === 2 || !hasPreparedTrait(access, entity)) return false;
  ctx.mutationDepth++;
  try {
    if (access.pair) applyRemoveTrait(ctx, entity, access.pair.descriptor);
    else applyRemovePreparedTrait(ctx, entity, access.instance);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return true;
}
