import { $internal } from '../common';
import { Pair, Wildcard } from '../relation/relation';
import type { World } from '../world/world';
import type { Entity } from './types';
import { releaseEntity } from './utils/entity-index';
import { getEntityId } from './utils/pack-entity';
import { executeRemoveTrait, getTraitById } from '../trait/trait-commands';

const cachedSet = new Set<Entity>();
const cachedQueue = [] as Entity[];

export function executeSpawnEntity(world: World, entity: Entity): void {
	const ctx = world[$internal];

	for (const query of ctx.notQueries) {
		const match = query.check(world, entity);
		if (match) query.add(entity);
		// Reset all tracking bitmasks for the query.
		query.resetTrackingBitmasks(getEntityId(entity));
	}

	ctx.entityTraits.set(entity, new Set());
}

export function executeDestroyEntity(world: World, entity: Entity): void {
	const ctx = world[$internal];

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

				const subjectTraits = ctx.entityTraits.get(subject);
				if (!subjectTraits) continue;

				for (const trait of subjectTraits) {
					const traitCtx = trait[$internal];
					if (!traitCtx.isPairTrait) continue;

					const relationCtx = traitCtx.relation![$internal];

					// Remove wildcard pair trait.
					const wildcardPairTrait = Pair(Wildcard, currentEntity);
					executeRemoveTrait(world, subject, wildcardPairTrait[$internal].id);

					if (traitCtx.pairTarget === currentEntity) {
						// Remove the specific pair trait.
						executeRemoveTrait(world, subject, trait[$internal].id);

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
				executeRemoveTrait(world, currentEntity, trait[$internal].id);
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
			if (!ctx.entityMasks[i]) continue;
			ctx.entityMasks[i][eid] = 0;
		}
	}
}
