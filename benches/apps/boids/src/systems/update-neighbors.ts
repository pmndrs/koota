import { World } from 'koota';
import { BoidsConfig, Neighbors, Position, SpatialHashMap } from '../traits';

export const updateNeighbors = ({ world }: { world: World }) => {
	const { value: spatialHashMap } = world.get(SpatialHashMap);
	const { neighborSearchRadius } = world.get(BoidsConfig);

	world
		.query(Position, Neighbors)
		.updateEach(([{ value: position }, { value: neighbors }], entity) => {
			spatialHashMap.getNearbyEntities(
				position.x,
				position.y,
				position.z,
				neighborSearchRadius,
				neighbors,
				100
			);

			/* Remove entity itself from neighbors */
			neighbors.splice(neighbors.indexOf(entity), 1);
		});
};
