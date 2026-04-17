import { $internal } from '../common';
import { IsExcluded, queryInternal } from '../query/query';
import { getEntitiesWithRelationTo, getRelationTargets, hasRelationPair } from '../relation/relation';
import type { RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { addTrait, cleanupRelationTarget, hasTrait, removeTrait } from '../trait/trait';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { universe } from '../universe/universe';
import type { WorldContext } from '../world';
import type { Entity } from './types';
import { allocateEntity, isEntityAlive, releaseEntity } from './utils/entity-index';
import { getEntityId } from './utils/pack-entity';
import { EMPTY_MASK_PAGE } from './utils/paged-mask';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(ctx: WorldContext, ...traits: ConfigurableTrait[]): Entity {
    const entity = allocateEntity(ctx.entityIndex);
    for (const query of ctx.notQueries) {
        const match = query.check(ctx, entity);
        if (match) query.add(entity);
        query.resetTrackingBitmasks(getEntityId(entity));
    }

    ctx.entityTraits.set(entity, new Set());
    addTrait(ctx, entity, ...traits);

    if (ctx.entitySpawnSubscriptions.size > 0 && !ctx.entityTraits.get(entity)!.has(IsExcluded)) {
        for (const sub of ctx.entitySpawnSubscriptions) sub(entity);
    }

    return entity;
}

const cachedSet = new Set<Entity>();
const cachedQueue = [] as Entity[];

export function destroyEntity(ctx: WorldContext, entity: Entity) {
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

        if (ctx.entityDestroySubscriptions.size > 0 && currentEntity !== ctx.worldEntity) {
            for (const sub of ctx.entityDestroySubscriptions) sub(currentEntity);
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

/** Resolve WorldContext directly from pageOwners. Used by entity methods. */
export function getEntityContext(entity: Entity): WorldContext {
    return universe.pageOwners[getEntityId(entity) >>> 10]!;
}

export function entityHas(ctx: WorldContext, entity: Entity, trait: Trait | RelationPair): boolean {
    if (!isRelationPair(trait)) return hasTrait(ctx, entity, trait);
    if (!hasTrait(ctx, entity, trait.relation[$internal].trait)) return false;
    if (trait.targetQuery) {
        const targets = getRelationTargets(ctx, trait.relation, entity);
        return queryInternal(ctx, ...(trait.targetQuery as any)).some((match: Entity) =>
            targets.includes(match)
        );
    }
    return hasRelationPair(ctx, entity, trait);
}
