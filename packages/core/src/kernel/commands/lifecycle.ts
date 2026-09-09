import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/pack-entity';
import { getRelationData, setRelationData } from '../relation/relation';
import { getTraitInstance } from '../trait/trait';
import type { Trait, TraitHooks } from '../trait/types';
import type { KernelContext } from '../context';
import { clearBuffer, createBufferState, type CommandBufferState } from './buffer-state';
import { flushCommands } from './interpreter';

export function pendingCommands(ctx: KernelContext): CommandBufferState {
  return (ctx.pendingCommands ??= createBufferState(ctx));
}

/** Internal indexes update immediately, user query notifications wait for the lifecycle. */
export function notifyQuery(
  ctx: KernelContext,
  subscribers: Set<(entity: Entity) => void>,
  entity: Entity
): void {
  if (subscribers.size === 0) return;
  if (ctx.mutationDepth > 0) ctx.queryNotifications.push([subscribers, entity]);
  else for (const callback of subscribers) callback(entity);
}

export function publishQueryNotifications(ctx: KernelContext): void {
  const notifications = ctx.queryNotifications;
  if (notifications.length === 0) return;
  for (let i = 0; i < notifications.length; i++) {
    const [subscribers, entity] = notifications[i];
    for (const callback of subscribers) callback(entity);
  }
  notifications.length = 0;
}

export function finishMutation(ctx: KernelContext): void {
  if (ctx.queryNotifications.length > 0) {
    try {
      publishQueryNotifications(ctx);
    } catch (error) {
      abortMutation(ctx);
      throw error;
    }
  }
  ctx.mutationDepth--;
  if (ctx.mutationDepth === 0 && !ctx.flushing && ctx.pendingCommands?.words.length) {
    flushCommands(ctx);
  }
}

export function abortMutation(ctx: KernelContext): void {
  ctx.mutationDepth--;
  ctx.queryNotifications.length = 0;
  if (ctx.pendingCommands && !ctx.pendingCommands.playing) clearBuffer(ctx.pendingCommands);
}

export function invokeTraitHook(
  ctx: KernelContext,
  entity: Entity,
  trait: Trait,
  event: keyof TraitHooks,
  target?: Entity
): void {
  const definition = trait[$internal];
  const hook = definition.hooks?.[event];
  if (!hook) return;
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  const value =
    target === undefined
      ? definition.get(getEntityId(entity), instance.store)
      : getRelationData(ctx, entity, definition.relation!, target);
  hook(value, entity, target);
  if (event === 'onRemove' || definition.type === 'tag') return;
  if (target === undefined) definition.set(getEntityId(entity), instance.store, value);
  else setRelationData(ctx, entity, definition.relation!, target, value);
}
