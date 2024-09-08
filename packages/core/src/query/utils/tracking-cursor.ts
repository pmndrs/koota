import { $changedMasks, $dirtyMasks, $internal, $trackingSnapshots } from '../../world/symbols';
import { World } from '../../world/world';

// Some values are reserved.
// 0 - has
// 1 - not
let cursor = 2;

export function createTrackingId() {
	return cursor++;
}

export function getTrackingCursor() {
	return cursor;
}

export function setTrackingMasks(world: World, id: number) {
	const ctx = world[$internal];
	const snapshot = structuredClone(ctx.entityMasks);
	world[$trackingSnapshots].set(id, snapshot);

	// For dirty and changed masks, make clone of entity masks and set all bits to 0.
	world[$dirtyMasks].set(
		id,
		snapshot.map((mask) => mask.map(() => 0))
	);

	world[$changedMasks].set(
		id,
		snapshot.map((mask) => mask.map(() => 0))
	);
}
