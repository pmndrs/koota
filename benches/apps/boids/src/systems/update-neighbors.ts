import { World } from 'koota';
import { Neighbors, Position, SpatialHashMap } from '../traits';

const maxDistance = 3;

export const updateNeighbors = ({ world }: { world: World }) => {
	const { value: spatialHashMap } = world.get(SpatialHashMap);

	world.query(Position, Neighbors).updateEach(
		([{ value: position }, { value: neighbors }], entity) => {
			spatialHashMap.getNearbyEntities(
				position.x,
				position.y,
				position.z,
				maxDistance,
				neighbors,
				100
			);
			/* Remove entity itself from neighbors */
			neighbors.splice(neighbors.indexOf(entity), 1);
		},
		{ passive: true }
	);
};
