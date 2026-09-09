import type { KernelContext } from '../context';
import { isEntityAlive } from '../entity/entity-index';
import { getTraitInstance, registerTrait } from './trait';
import { subscribeEntity, type Subscriber } from './subscriptions';
import type { Trait } from './types';

export type VersionSource = { readonly version: number };

export function getTraitVersionSource(ctx: KernelContext, trait: Trait): VersionSource | undefined {
  return getTraitInstance(ctx.traitInstances, trait);
}

export function subscribeTrait(
  ctx: KernelContext,
  trait: Trait,
  event: 'add' | 'remove' | 'change',
  callback: Subscriber,
  entity?: number
): () => void {
  if (entity !== undefined && !isEntityAlive(ctx.entityIndex, entity)) return () => {};
  let instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance) {
    registerTrait(ctx, trait);
    instance = getTraitInstance(ctx.traitInstances, trait)!;
  }
  const subscriptions =
    event === 'add'
      ? instance.addSubscriptions
      : event === 'remove'
        ? instance.removeSubscriptions
        : instance.changeSubscriptions;
  if (entity !== undefined) {
    ctx.entitySubscribedInstances.add(instance);
    return subscribeEntity(subscriptions, entity, callback);
  }
  subscriptions.all.add(callback);
  return () => subscriptions.all.delete(callback);
}
