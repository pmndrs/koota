import { $internal } from '../common';
import { getEntitiesWithRelationTo, getRelationTargets } from '../relation/relation';
import { addTrait, cleanupRelationTarget, removeTrait } from '../trait/trait';
import type { ConfigurableTrait } from '../trait/types';
import { universe } from '../universe/universe';
import type { WorldInternal } from '../world';
import type { Entity } from './types';
import { allocateEntity, isEntityAlive, releaseEntity } from './utils/entity-index';
import { getEntityId } from './utils/pack-entity';
import { EMPTY_MASK_PAGE } from './utils/paged-mask';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(ctx: WorldInternal, ...traits: ConfigurableTrait[]): Entity {
    const entity = allocateEntity(ctx.entityIndex);
    for (const query of ctx.notQueries) {
        const match = query.check(ctx, entity);
        if (match) query.add(entity);
        query.resetTrackingBitmasks(getEntityId(entity));
    }

    ctx.entityTraits.set(entity, new Set());
    addTrait(ctx, entity, ...traits);

    return entity;
}

const cachedSet = new Set<Entity>();
const cachedQueue = [] as Entity[];

export function destroyEntity(ctx: WorldInternal, entity: Entity) {
    if (!isEntityAlive(ctx.entityIndex, entity))
        throw new Error('Koota: The entity being destroyed does not exist.');

    const entityQueue = cachedQueue;
    const processedEntities = cachedSet;

    entityQueue.length = 0;
    entityQueue.push(entity);
    processedEntities.clear();

    while (entityQueue.length > 0) {
        const currentEntity = entityQueue.pop()!;
        if (processedEntities.has(currentEntity)) continue;

        processedEntities.add(currentEntity);

        for (const relation of ctx.relations) {
            const relationCtx = relation[$internal];

            const sources = getEntitiesWithRelationTo(ctx, relation, currentEntity);
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

        const entityTraits = ctx.entityTraits.get(currentEntity);
        if (entityTraits) {
            for (const trait of entityTraits) {
                removeTrait(ctx, currentEntity, trait);
            }
        }

        releaseEntity(ctx.entityIndex, currentEntity);

        const allQuery = ctx.queriesHashMap.get('');
        if (allQuery) allQuery.remove(ctx, currentEntity);

        ctx.entityTraits.delete(currentEntity);

        const eid = getEntityId(currentEntity);
        const pageId = eid >>> 10;
        const offset = eid & 1023;
        for (let i = 0; i < ctx.entityMasks.length; i++) {
            const page = ctx.entityMasks[i][pageId];
            if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
        }
    }
}

/** Resolve WorldInternal directly from pageOwners. Used by entity methods. */
export function getEntityContext(entity: Entity): WorldInternal {
    return universe.pageOwners[getEntityId(entity) >>> 10]!;
}
