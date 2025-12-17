import { $internal } from '../../common';
import { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { World } from '../../world';
import { EventType, QueryInstance } from '../types';

/**
 * Check if an entity matches a tracking query with event handling.
 */
export function checkQueryTracking(
	world: World,
	query: QueryInstance,
	entity: Entity,
	eventType: EventType,
	eventGenerationId: number,
	eventBitflag: number
): boolean {
	const { bitmasks, generations } = query;
	const ctx = world[$internal];
	const eid = getEntityId(entity);

	if (query.traitInstances.all.length === 0) return false;

	for (let i = 0; i < generations.length; i++) {
		const generationId = generations[i];
		const bitmask = bitmasks[i];
		const { required, forbidden, or, added, removed, changed } = bitmask;
		const entityMask = ctx.entityMasks[generationId][eid];

		if (!forbidden && !required && !or && !removed && !added && !changed) {
			return false;
		}

		// Handle events only for matching generation
		if (eventGenerationId === generationId) {
			if (eventType === 'add') {
				if (removed & eventBitflag) return false;
				if (added & eventBitflag) {
					bitmask.addedTracker[eid] |= eventBitflag;
				}
			} else if (eventType === 'remove') {
				if (added & eventBitflag) return false;
				if (removed & eventBitflag) {
					bitmask.removedTracker[eid] |= eventBitflag;
				}
				if (changed & eventBitflag) return false;
			} else if (eventType === 'change') {
				if (!(entityMask & eventBitflag)) return false;
				if (changed & eventBitflag) {
					bitmask.changedTracker[eid] |= eventBitflag;
				}
			}
		}

		// Check forbidden traits
		if ((entityMask & forbidden) !== 0) return false;

		// Check required traits
		if ((entityMask & required) !== required) return false;

		// Check Or traits
		if (or !== 0 && (entityMask & or) === 0) return false;

		// Check tracking masks only for matching generation
		if (eventGenerationId === generationId) {
			if (added) {
				const entityAddedTracker = bitmask.addedTracker[eid] || 0;
				if ((entityAddedTracker & added) !== added) return false;
			}
			if (removed) {
				const entityRemovedTracker = bitmask.removedTracker[eid] || 0;
				if ((entityRemovedTracker & removed) !== removed) return false;
			}
			if (changed) {
				const entityChangedTracker = bitmask.changedTracker[eid] || 0;
				if ((entityChangedTracker & changed) !== changed) return false;
			}
		}
	}

	return true;
}
