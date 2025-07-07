import { createWorld } from 'koota';
import { BoidsConfig, SpatialHashMap, Time } from './traits';
import { SpatialHashMap as SpatialHashMapImpl } from './utils/spatial-hash';

export const world = createWorld(
	Time,
	SpatialHashMap(new SpatialHashMapImpl(5)),
	BoidsConfig({
		initialCount: 500,
		maxVelocity: 6,
		separationFactor: 16,
		alignmentFactor: 0.5,
		coherenceFactor: 0.5,
		avoidEdgesFactor: 5,
		avoidEdgesMaxDistance: 15,
		neighborSearchRadius: 3,
	})
);
