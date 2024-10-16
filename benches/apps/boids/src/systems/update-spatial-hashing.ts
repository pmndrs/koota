import { World } from 'koota';
import { Position, SpatialHashMap } from '../traits';

export const updateSpatialHashing = ({ world }: { world: World }) => {
	const { value: spatialHashMap } = world.get(SpatialHashMap);

	world.query(Position).updateEach(
		([{ value: position }], entity) => {
			spatialHashMap.setEntity(entity, position.x, position.y, position.z);
		},
		{ passive: true }
	);
};
