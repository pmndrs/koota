import { createRemoved, type World } from 'koota';
import { SpatialHashMap, Transform } from '../traits';

const Removed = createRemoved();

export const cleanupSpatialHashMap = ({ world }: { world: World }) => {
	const spatialHashMap = world.get(SpatialHashMap)!;
	world.query(Removed(Transform)).forEach((entity) => {
		spatialHashMap.removeEntity(entity);
	});
};
