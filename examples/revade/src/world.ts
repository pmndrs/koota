import { createWorld } from 'koota/entity-methods';
import { EnemySpawner, Keyboard, SpatialHashMap, Time, Transform } from './traits';

export const world = createWorld();
world.add(Time, Keyboard, SpatialHashMap, EnemySpawner);

// Drop an entity from the spatial hash as soon as it loses its transform
// A destroyed entity never lingers there for a system to read
world.onRemove(Transform, (entity) => world.get(SpatialHashMap)!.removeEntity(entity));
