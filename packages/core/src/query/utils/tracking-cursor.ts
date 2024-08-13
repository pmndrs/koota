import { $entityMasks, $trackingSnapshots, $dirtyMasks, $changedMasks } from '../../world/symbols';
import { World } from '../../world/world';

let cursor = 0;

export function createTrackingId() {
	return cursor++;
}

export function getTrackingCursor() {
	return cursor;
}

export function setTrackingMasks(world: World, id: number) {
	const snapshot = structuredClone(world[$entityMasks]);
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
