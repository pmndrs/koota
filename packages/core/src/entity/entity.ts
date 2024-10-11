import { removeTrait } from '../trait/trait';
import { ConfigurableTrait } from '../trait/types';
import { Pair, Wildcard } from '../relation/relation';
import { $internal } from '../common';
import { World } from '../world/world';
import { Entity } from './types';
import { allocateEntity, releaseEntity } from './utils/entity-index';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(world: World, ...traits: ConfigurableTrait[]): Entity {
	const ctx = world[$internal];
	const entity = allocateEntity(ctx.entityIndex);

	for (const query of ctx.notQueries) {
		const match = query.check(world, entity);
		if (match) query.add(entity);
	}

	ctx.entityTraits.set(entity, new Set());
	entity.add(...traits);

	return entity;
}

const cachedSet = new Set<Entity>();
const cachedQueue = [] as Entity[];

export function destroyEntity(world: World, entity: Entity) {
	const ctx = world[$internal];

	// Check if entity exists.
	if (!world.has(entity)) return;

	// Caching the lookup in the outer scope of the loop increases performance.
	const entityQueue = cachedQueue;
	const processedEntities = cachedSet;

	// Ensure the queue is empty before starting.
	entityQueue.length = 0;
	entityQueue.push(entity);

	// Destroyed entities may be the target of relations.
	// To avoid stale references, all these relations must be removed.
	// In addition, if the relation has the autoRemoveTarget flag set,
	// the target entity should also be destroyed, for example children relations.
	while (entityQueue.length > 0) {
		const currentEid = entityQueue.pop()!;
		if (processedEntities.has(currentEid)) continue;
		processedEntities.add(currentEid);

		// Process all related entities and traits.
		for (const subject of world.query(Wildcard(currentEid))) {
			if (!world.has(subject)) continue;

			for (const trait of ctx.entityTraits.get(subject)!) {
				const traitCtx = trait[$internal];
				if (!traitCtx.isPairTrait) continue;

				const relationCtx = traitCtx.relation[$internal];

				// Remove wildcard pair trait.
				removeTrait(world, subject, Pair(Wildcard, currentEid));

				if (traitCtx.pairTarget === currentEid) {
					// Remove the specific pair trait.
					removeTrait(world, subject, trait);

					if (relationCtx.autoRemoveTarget) {
						entityQueue.push(subject);
					}
				}
			}
		}

		// Remove all traits of the current entity.
		const entityTraits = ctx.entityTraits.get(currentEid);
		if (entityTraits) {
			for (const trait of entityTraits) {
				removeTrait(world, currentEid, trait);
			}
		}

		// Free the entity.
		releaseEntity(ctx.entityIndex, currentEid);

		// Remove all entity state from world.
		ctx.entityTraits.delete(entity);

		// Clear entity bitmasks.
		for (let i = 0; i < ctx.entityMasks.length; i++) {
			ctx.entityMasks[i][entity] = 0;
		}
	}
}
