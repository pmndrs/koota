import { createWorld } from 'koota';
import { EnemySpawner, Keyboard, SpatialHashMap, Time } from './traits';

export const world = createWorld(Time, Keyboard, SpatialHashMap, EnemySpawner);
