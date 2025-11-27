import { $internal } from '../common';
import {
	getRelationTargets,
	isRelationTarget,
	removeRelationTarget,
	Wildcard,
} from '../relation/relation';
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

		// Process all entities that have relations to this entity using reverse index
		if (isRelationTarget(world, currentEntity)) {
			const wildcardIndex = Wildcard[$internal].targetIndex[currentEntity];

			if (wildcardIndex && wildcardIndex.size > 0) {
				// Get all subjects that target this entity
				const subjects = Array.from(wildcardIndex);

				for (const subjectEid of subjects) {
					// Find the full entity from the subject eid
					let subject: Entity | null = null;
					for (const e of ctx.entityIndex.dense) {
						if (getEntityId(e) === subjectEid) {
							subject = e;
							break;
						}
					}

					if (!subject || !world.has(subject)) continue;

					// Find which relations this subject has to currentEntity
					const subjectTraits = ctx.entityTraits.get(subject);
					if (!subjectTraits) continue;

					// Iterate through traits to find relations pointing to currentEntity
					for (const trait of subjectTraits) {
						const traitCtx = trait[$internal];
						const relation = traitCtx.relation;

						if (!relation) continue;

						// Check if this relation has currentEntity as a target
						const targets = getRelationTargets(world, relation, subject);
						if (targets.includes(currentEntity)) {
							// Check if this relation has autoRemoveTarget
							const relationCtx = relation[$internal];

							// Remove the target from this relation
							removeRelationTarget(world, relation, subject, currentEntity);

							// If autoRemoveTarget, queue the subject for destruction
							if (relationCtx.autoRemoveTarget) {
								entityQueue.push(subject);
							}
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
		ctx.entityTraits.delete(currentEntity);

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
