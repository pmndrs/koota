import { $internal } from '../common';
import { getEntitiesWithRelationTo, getRelationTargets } from '../relation/relation';
import { addTrait, cleanupRelationTarget, removeTrait } from '../trait/trait';
import type { ConfigurableTrait } from '../trait/types';
import type { World } from '../world';
import { createEntityHandle } from './entity-handle';
import type { Entity, RawEntity } from './types';
import { allocateEntity, releaseEntity } from './utils/entity-index';
import { getEntityId } from './utils/pack-entity';

export function createRawEntity(world: World, ...traits: ConfigurableTrait[]): RawEntity {
    const ctx = world[$internal];
    const entity = allocateEntity(ctx.entityIndex);
    const eid = getEntityId(entity);

    for (const query of ctx.notQueries) {
        const match = query.check(world, entity);
        if (match) query.add(entity);
        query.resetTrackingBitmasks(eid);
    }

    ctx.entityTraits[eid] = new Set();
    addTrait(world, entity, ...traits);

    return entity;
}

export function createEntity(world: World, ...traits: ConfigurableTrait[]): Entity {
    return createEntityHandle(world, createRawEntity(world, ...traits));
}

const cachedSet = new Set<RawEntity>();
const cachedQueue = [] as RawEntity[];

export function destroyEntity(world: World, entity: RawEntity) {
    const ctx = world[$internal];

    if (!world.has(entity)) throw new Error('Koota: The entity being destroyed does not exist.');

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

            const sources = getEntitiesWithRelationTo(world, relation, currentEntity);
            for (const source of sources) {
                if (!world.has(source)) continue;

                cleanupRelationTarget(world, relation, source, currentEntity);

                if (relationCtx.autoDestroy === 'source') entityQueue.push(source);
            }

            if (relationCtx.autoDestroy === 'target') {
                const targets = getRelationTargets(world, relation, currentEntity);
                for (const target of targets) {
                    if (!world.has(target)) continue;
                    if (!processedEntities.has(target)) entityQueue.push(target);
                }
            }
        }

        const eid = getEntityId(currentEntity);

        const entityTraits = ctx.entityTraits[eid];
        if (entityTraits) {
            for (const trait of entityTraits) {
                removeTrait(world, currentEntity, trait);
            }
        }

        ctx.entityHandles[eid] = undefined;
        ctx.entityTraits[eid] = undefined;
        releaseEntity(ctx.entityIndex, currentEntity);

        const allQuery = ctx.queriesHashMap.get('');
        if (allQuery) allQuery.remove(world, currentEntity);

        for (let i = 0; i < ctx.entityMasks.length; i++) {
            ctx.entityMasks[i][eid] = 0;
        }
    }
}
