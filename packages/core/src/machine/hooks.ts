import { assertsEnabled } from '../build-flags';
import { subscribeHook } from '../command/settled';
import { assertEntityAlive } from '../entity/entity-index';
import type { Entity } from '../entity/types';
import { registerTrait } from '../trait/registry';
import type { WorldContext } from '../world/types';
import type { Machine, TransitionSubscriber } from './types';

/** Backs onTransition. Reports transitions of one entity, or of every entity with the machine. */
export function subscribeTransition(
  ctx: WorldContext,
  machine: Machine,
  callback: TransitionSubscriber,
  entity?: Entity
): () => void {
  const instance = ctx.traitInstances[machine.id] ?? registerTrait(ctx, machine);
  const data = instance.machine!;
  let subscriptions = data.subscribers;
  if (entity !== undefined) {
    if (assertsEnabled) assertEntityAlive(ctx, entity);
    subscriptions = data.byEntity.get(entity)!;
    if (subscriptions === undefined) data.byEntity.set(entity, (subscriptions = new Map()));
    ctx.entitySubscribedInstances.add(instance);
  }
  return subscribeHook(ctx, callback, (listener) => {
    const version = subscriptions.get(listener) ?? ++data.subscriptionVersion;
    subscriptions.set(listener, version);
    return () => {
      if (subscriptions.get(listener) !== version) return;
      subscriptions.delete(listener);
      if (
        entity !== undefined &&
        subscriptions.size === 0 &&
        data.byEntity.get(entity) === subscriptions
      )
        data.byEntity.delete(entity);
    };
  });
}
