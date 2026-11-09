import { createWorld } from 'koota/entity-methods';
import { EnemySpawner, Keyboard, SpatialHashMap, Time } from './traits';

export const world = createWorld();
world.add(Time, Keyboard, SpatialHashMap, EnemySpawner);
