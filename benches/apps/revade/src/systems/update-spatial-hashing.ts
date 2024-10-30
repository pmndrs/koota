import { World } from 'koota';
import { Transform, SpatialHashMap, IsEnemy } from '../traits';

export const updateSpatialHashing = ({ world }: { world: World }) => {
	const spatialHashMap = world.get(SpatialHashMap);

	world.query(Transform, IsEnemy).updateEach(([{ position }], entity) => {
		spatialHashMap.setEntity(entity, position.x, position.y, position.z);
	});
};
