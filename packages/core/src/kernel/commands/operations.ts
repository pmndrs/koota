import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/entity-index';
import type { RelationPair } from '../relation/types';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { KernelContext } from '../context';
import { applyAddTrait, applyRemoveTrait, applySetTrait } from './handlers/trait';
import { applySpawnEntity, applyDestroyEntity } from './handlers/entity';
import { applyChanged, applyPairChanged } from './handlers/changed';
import { abortMutation, finishMutation, pendingCommands } from './lifecycle';
import {
  recordAdd,
  recordChanged,
  recordDestroy,
  recordRemove,
  recordSet,
  recordSpawn,
} from './recording';

export function addTrait(ctx: KernelContext, entity: Entity, ...traits: ConfigurableTrait[]): void {
  if (ctx.mutationDepth > 0) {
    recordAdd(pendingCommands(ctx), entity, ...traits);
    return;
  }
  for (const value of traits) {
    if (!isEntityAlive(ctx.entityIndex, entity)) return;
    ctx.mutationDepth++;
    try {
      applyAddTrait(ctx, entity, value);
    } catch (error) {
      abortMutation(ctx);
      throw error;
    }
    finishMutation(ctx);
  }
}

export function removeTrait(
  ctx: KernelContext,
  entity: Entity,
  ...traits: (Trait | RelationPair)[]
): void {
  if (ctx.mutationDepth > 0) {
    recordRemove(pendingCommands(ctx), entity, ...traits);
    return;
  }
  for (const value of traits) {
    if (!isEntityAlive(ctx.entityIndex, entity)) return;
    ctx.mutationDepth++;
    try {
      applyRemoveTrait(ctx, entity, value);
    } catch (error) {
      abortMutation(ctx);
      throw error;
    }
    finishMutation(ctx);
  }
}

export function setTrait(
  ctx: KernelContext,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any,
  triggerChanged = true
): void {
  if (ctx.mutationDepth > 0) {
    recordSet(pendingCommands(ctx), entity, trait, value, triggerChanged);
    return;
  }
  if (!isEntityAlive(ctx.entityIndex, entity)) return;
  ctx.mutationDepth++;
  try {
    applySetTrait(ctx, entity, trait, value, triggerChanged);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
}

export function setChanged(ctx: KernelContext, entity: Entity, trait: Trait): void {
  if (ctx.mutationDepth > 0) {
    recordChanged(pendingCommands(ctx), entity, trait);
    return;
  }
  if (!isEntityAlive(ctx.entityIndex, entity)) return;
  ctx.mutationDepth++;
  try {
    applyChanged(ctx, entity, trait);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
}

export function setPairChanged(
  ctx: KernelContext,
  entity: Entity,
  trait: Trait,
  target: Entity
): void {
  if (ctx.mutationDepth > 0) {
    recordChanged(pendingCommands(ctx), entity, trait, target);
    return;
  }
  if (!isEntityAlive(ctx.entityIndex, entity)) return;
  ctx.mutationDepth++;
  try {
    applyPairChanged(ctx, entity, trait, target);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
}

export function destroyEntity(ctx: KernelContext, entity: Entity): void {
  if (ctx.mutationDepth > 0) {
    recordDestroy(pendingCommands(ctx), entity);
    return;
  }
  ctx.mutationDepth++;
  try {
    applyDestroyEntity(ctx, entity);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
}

export function createEntity(ctx: KernelContext, ...traits: ConfigurableTrait[]): Entity {
  if (ctx.mutationDepth > 0) return recordSpawn(pendingCommands(ctx), ...traits);
  ctx.mutationDepth++;
  let entity: Entity;
  try {
    entity = applySpawnEntity(ctx, traits);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return entity;
}
