import { $internal } from '../common';
import type { World } from '../world/world';
import type { StoreUpdateEvent } from '../world/events';

/**
 * Set up query event listeners for store update events.
 * This replaces the direct query updates that used to happen in trait operations.
 */
export function setupQueryEventListeners(world: World): void {
	const ctx = world[$internal];

	// Listen for store update events and update queries accordingly
	ctx.storeEventEmitter.on((event: StoreUpdateEvent) => {
		handleStoreUpdateEvent(world, event);
	});
}

/**
 * Handle a store update event by updating relevant queries
 */
function handleStoreUpdateEvent(world: World, event: StoreUpdateEvent): void {
	const { type, entity, traitData } = event;
	const { queries } = traitData;

	// Update all queries that care about this trait
	for (const query of queries) {
		// Remove this entity from toRemove if it exists in this query.
		query.toRemove.remove(entity);

		// Check if the entity matches the query after the store update.
		const match = query.check(world, entity, { type, traitData });

		if (match) {
			query.add(entity);
		} else {
			query.remove(world, entity);
		}
	}
}
