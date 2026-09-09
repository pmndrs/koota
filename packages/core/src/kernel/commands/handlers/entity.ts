import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import {
  allocateEntity,
  activateReservedEntity,
  isEntityAlive,
  releaseEntity,
} from '../../entity/entity-index';
import { getEntityId } from '../../entity/pack-entity';
import { EMPTY_MASK_PAGE } from '../../entity/paged-mask';
import { getEntitiesWithRelationTo, getRelationTargets } from '../../relation/relation';
import { clearEntity } from '../../trait/subscriptions';
import type { ConfigurableTrait } from '../../trait/types';
import type { KernelContext } from '../../context';
import { applyAddTrait, applyRemoveTrait, cleanupRelationTarget } from './trait';

export function applySpawnEntity(
  ctx: KernelContext,
  traits: ConfigurableTrait[],
  reserved?: Entity
): Entity {
  const entity =
    reserved === undefined
      ? allocateEntity(ctx.entityIndex)
      : activateReservedEntity(ctx.entityIndex, reserved);
  for (const query of ctx.notQueries) {
    const match = query.check(ctx, entity);
    if (match) query.add(entity);
    query.resetTrackingBitmasks(getEntityId(entity));
  }

  ctx.entityTraits.set(entity, new Set());
  for (const trait of traits) applyAddTrait(ctx, entity, trait);

  if (ctx.entitySpawnSubscriptions.size > 0) {
    for (const sub of ctx.entitySpawnSubscriptions) sub(entity);
  }

  return entity;
}

export function applyDestroyEntity(ctx: KernelContext, entity: Entity) {
  if (!isEntityAlive(ctx.entityIndex, entity))
    throw new Error('Koota: The entity being destroyed does not exist.');

  const entityQueue = [entity];
  const processedEntities = new Set<Entity>();

  while (entityQueue.length > 0) {
    const currentEntity = entityQueue.pop()!;
    if (processedEntities.has(currentEntity)) continue;

    processedEntities.add(currentEntity);

    for (const relation of ctx.relations) {
      const relationCtx = relation[$internal];

      // Cleanup removes entries from the reverse bucket while it is traversed.
      const sources = getEntitiesWithRelationTo(ctx, relation, currentEntity).slice();
      for (const source of sources) {
        if (!isEntityAlive(ctx.entityIndex, source)) continue;
        cleanupRelationTarget(ctx, relation, source, currentEntity);
        if (relationCtx.autoDestroy === 'source') entityQueue.push(source);
      }

      if (relationCtx.autoDestroy === 'target') {
        const targets = getRelationTargets(ctx, relation, currentEntity);
        for (const target of targets) {
          if (!isEntityAlive(ctx.entityIndex, target)) continue;
          if (!processedEntities.has(target)) entityQueue.push(target);
        }
      }
    }

    if (ctx.entityDestroySubscriptions.size > 0) {
      for (const sub of ctx.entityDestroySubscriptions) sub(currentEntity);
    }

    const entityTraits = ctx.entityTraits.get(currentEntity);
    if (entityTraits) {
      for (const trait of entityTraits) {
        applyRemoveTrait(ctx, currentEntity, trait);
      }
    }

    releaseEntity(ctx.entityIndex, currentEntity);

    const allQuery = ctx.queriesHashMap.get('');
    if (allQuery) allQuery.remove(ctx, currentEntity);

    ctx.entityTraits.delete(currentEntity);

    // Drop entity subscribers so a recycled id never inherits them. Instances
    // that no longer hold any are pruned from the index here.
    for (const instance of ctx.entitySubscribedInstances) {
      clearEntity(instance.addSubscriptions, currentEntity);
      clearEntity(instance.removeSubscriptions, currentEntity);
      clearEntity(instance.changeSubscriptions, currentEntity);
      if (
        instance.addSubscriptions.entityCount === 0 &&
        instance.removeSubscriptions.entityCount === 0 &&
        instance.changeSubscriptions.entityCount === 0
      ) {
        ctx.entitySubscribedInstances.delete(instance);
      }
    }

    const eid = getEntityId(currentEntity);
    const pageId = eid >>> 10;
    const offset = eid & 1023;
    for (let i = 0; i < ctx.entityMasks.length; i++) {
      const page = ctx.entityMasks[i][pageId];
      if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
    }
  }
}
