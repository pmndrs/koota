import { $internal } from '../common';
import { add, remove } from '../trait/api';
import {
    cleanupRelationTarget,
    getEntitiesWithRelationTo,
    getRelationTargets,
} from '../trait/relation';
import type { TraitLike } from '../trait/types';
import { getTraitInstance } from '../trait/trait-instance';
import { universe } from '../universe/universe';
import type { World } from '../world';
import type { Entity } from './types';
import { allocateEntity, releaseEntity } from './utils/entity-index';
import { getEntityId, getEntityWorldId } from './utils/pack-entity';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(world: World, ...traits: TraitLike[]): Entity {
    const ctx = world[$internal];
    const entity = allocateEntity(ctx.entityIndex);

    for (const query of ctx.notQueries) {
        const match = query.check(world, entity);
        if (match) query.add(entity);
        // Reset all tracking bitmasks for the query.
        query.resetTrackingBitmasks(getEntityId(entity));
    }

    ctx.entityTraits.set(entity, new Set());
    add(world, entity, ...traits);

    return entity;
}

const cachedSet = new Set<Entity>();
const cachedQueue = [] as Entity[];

export function destroyEntity(world: World, entity: Entity) {
    const ctx = world[$internal];

    // Check if entity exists.
    if (!world.has(entity)) throw new Error('Koota: The entity being destroyed does not exist.');

    // Caching the lookup in the outer scope of the loop increases performance.
    const entityQueue = cachedQueue;
    const processedEntities = cachedSet;

    // Ensure the queue is empty before starting.
    entityQueue.length = 0;
    entityQueue.push(entity);
    processedEntities.clear();

    // Destroyed entities may be relation targets.
    // To avoid stale references, remove all relation pairs pointing to each destroyed target.
    while (entityQueue.length > 0) {
        const currentEntity = entityQueue.pop()!;
        if (processedEntities.has(currentEntity)) continue;

        processedEntities.add(currentEntity);

        for (const relation of ctx.relations) {
            const instance = getTraitInstance(ctx.traitInstances, relation);

            // Handle entities that have relations pointing TO currentEntity (currentEntity is target).
            const sources = getEntitiesWithRelationTo(world, relation, currentEntity);
            for (const source of sources) {
                if (!world.has(source)) continue;

                // autoDestroy 'source'/'orphan': queue sources for destruction
                if (instance?.autoDestroy === 'source' && !processedEntities.has(source)) {
                    entityQueue.push(source);
                }

                // Remove the relation from source to currentEntity
                cleanupRelationTarget(world, relation, source, currentEntity);
            }

            // autoDestroy 'target': when source is destroyed, queue its targets for destruction
            if (instance?.autoDestroy === 'target') {
                const targets = getRelationTargets(world, relation, currentEntity);
                for (const tgt of targets) {
                    if (world.has(tgt) && !processedEntities.has(tgt)) {
                        entityQueue.push(tgt);
                    }
                }
            }
        }

        // Remove all traits of the current entity.
        const entityTraits = ctx.entityTraits.get(currentEntity);
        if (entityTraits) {
            for (const trait of entityTraits) {
                remove(world, currentEntity, trait);
            }
        }

        // Free the entity.
        releaseEntity(ctx.entityIndex, currentEntity);

        // Remove the entity from the all query.
        const allQuery = ctx.queriesHashMap.get('');
        if (allQuery) allQuery.remove(world, currentEntity);

        // Remove all entity state from world.
        ctx.entityTraits.delete(currentEntity);
    }
}

/* @inline @pure */ export function getEntityWorld(entity: Entity) {
    const worldId = getEntityWorldId(entity);
    return universe.worlds[worldId]!;
}
