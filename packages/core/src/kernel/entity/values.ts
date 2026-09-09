import { $internal } from '../common';
import type { KernelContext } from '../context';
import type { ValueBuffer } from '../storage/values';
import { publishChanged } from '../commands/handlers/changed';
import { abortMutation, finishMutation } from '../commands/lifecycle';
import { getTraitInstance } from '../trait/trait';
import { findMembership } from './membership';
import { isEntityAlive } from './entity-index';
import { getEntityId } from './pack-entity';
import type { Entity } from './types';

/** Copy the caller capacity and return the required field count, or -1 for an absent trait. */
export function readEntityValues(
  ctx: KernelContext,
  entity: Entity,
  predicate: Entity,
  output: ValueBuffer
): number {
  if (!isEntityAlive(ctx.entityIndex, entity) || !isEntityAlive(ctx.entityIndex, predicate))
    return -1;
  const edge = findMembership(ctx.memberships, entity, predicate);
  if (!edge) return -1;
  const pair = ctx.pairs.get(predicate);
  const instance = pair
    ? getTraitInstance(ctx.traitInstances, pair.relation[$internal].trait)!
    : ctx.definitions.get(predicate)!;
  const definition = instance.trait[$internal];
  if (!pair && definition.relation) return -1;
  definition.readValues(pair ? edge : getEntityId(entity), instance.store, output);
  return definition.fieldCount;
}

/** Writes require a complete row. Nested writes return false so the caller can defer them. */
export function writeEntityValues(
  ctx: KernelContext,
  entity: Entity,
  predicate: Entity,
  input: ValueBuffer
): boolean {
  if (
    ctx.mutationDepth > ctx.iterationDepth ||
    !isEntityAlive(ctx.entityIndex, entity) ||
    !isEntityAlive(ctx.entityIndex, predicate)
  )
    return false;
  const edge = findMembership(ctx.memberships, entity, predicate);
  if (!edge) return false;
  const pair = ctx.pairs.get(predicate);
  const instance = pair
    ? getTraitInstance(ctx.traitInstances, pair.relation[$internal].trait)!
    : ctx.definitions.get(predicate)!;
  const definition = instance.trait[$internal];
  if (!pair && definition.relation) return false;
  if (input.length < definition.fieldCount) return false;
  ctx.mutationDepth++;
  try {
    definition.writeValues(pair ? edge : getEntityId(entity), instance.store, input);
    publishChanged(ctx, entity, instance, pair?.target);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return true;
}
