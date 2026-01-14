import type { World } from 'koota';
import { SpatialHashMap, Transform } from '../traits';

export function updateSpatialHashing(world: World) {
    const spatialHashMap = world.get(SpatialHashMap)!;

    world.query(Transform).updateEach(([{ position }], entity) => {
        spatialHashMap.setEntity(entity, position.x, position.y, position.z);
    });
}
