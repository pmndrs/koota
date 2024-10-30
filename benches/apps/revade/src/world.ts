import { createWorld } from 'koota';
import { Time } from './traits';
import { SpatialHashMap } from './traits/spatial-hash-map';
import { SpatialHashMap as SpatialHashMapImpl } from './utils/spatial-hash';

export const world = createWorld(Time, SpatialHashMap(new SpatialHashMapImpl(50)));
