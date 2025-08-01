import { $internal } from '../common';
import { Pair, Wildcard } from '../relation/relation';
import { addTrait, removeTrait } from '../trait/trait';
import type { ConfigurableTrait } from '../trait/types';
import { universe } from '../universe/universe';
import type { World } from '../world/world';
import type { Entity } from './types';
import { allocateEntity, releaseEntity } from './utils/entity-index';
import { getEntityId, getEntityWorldId } from './utils/pack-entity';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(world: World, ...traits: ConfigurableTrait[]): Entity {
	const ctx = world[$internal];
	const entity = allocateEntity(ctx.entityIndex);

	for (const query of ctx.notQueries) {
		const match = query.check(world, entity);
		if (match) query.add(entity);
		// Reset all tracking bitmasks for the query.
		query.resetTrackingBitmasks(getEntityId(entity));
	}

	ctx.entityTraits.set(entity, new Set());
	addTrait(world, entity, ...traits);

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

	// Destroyed entities may be the target of relations.
	// To avoid stale references, all these relations must be removed.
	// In addition, if the relation has the autoRemoveTarget flag set,
	// the target entity should also be destroyed, for example children relations.
	while (entityQueue.length > 0) {
		const currentEntity = entityQueue.pop()!;
		if (processedEntities.has(currentEntity)) continue;

		processedEntities.add(currentEntity);

		// Process all related entities and traits.
		if (ctx.relationTargetEntities.has(currentEntity)) {
			for (const subject of world.query(Wildcard(currentEntity))) {
				if (!world.has(subject)) continue;

				for (const trait of ctx.entityTraits.get(subject)!) {
					const traitCtx = trait[$internal];
					if (!traitCtx.isPairTrait) continue;

					const relationCtx = traitCtx.relation![$internal];

					// Remove wildcard pair trait.
					removeTrait(world, subject, Pair(Wildcard, currentEntity));

					if (traitCtx.pairTarget === currentEntity) {
						// Remove the specific pair trait.
						removeTrait(world, subject, trait);

						if (relationCtx.autoRemoveTarget) {
							entityQueue.push(subject);
						}
					}
				}
			}
		}

		// Remove all traits of the current entity.
		const entityTraits = ctx.entityTraits.get(currentEntity);
		if (entityTraits) {
			for (const trait of entityTraits) {
				removeTrait(world, currentEntity, trait);
			}
		}

		// Free the entity.
		releaseEntity(ctx.entityIndex, currentEntity);

		// Remove the entity from the all query.
		const allQuery = ctx.queriesHashMap.get('');
		if (allQuery) allQuery.remove(world, currentEntity);

		// Remove all entity state from world.
		ctx.entityTraits.delete(entity);

		// Clear entity bitmasks.
		const eid = getEntityId(currentEntity);
		for (let i = 0; i < ctx.entityMasks.length; i++) {
			ctx.entityMasks[i][eid] = 0;
		}
	}
}

/* @inline @pure */ export function getEntityWorld(entity: Entity) {
	const worldId = getEntityWorldId(entity);
	return universe.worlds[worldId]!;
}
