import { createRemoved, type World } from 'koota';
import { SpatialHashMap, Transform } from '../traits';

const Removed = createRemoved();

export function cleanupSpatialHashMap(world: World) {
  const spatialHashMap = world.get(SpatialHashMap)!;
  for (const entity of world.query(Removed(Transform))) {
    spatialHashMap.removeEntity(entity);
  }
}
