import { createWorld } from 'koota';
import { SpatialHashMap, Time } from './traits';
import { SpatialHashMap as SpatialHashMapImpl } from './utils/spatial-hash';

export const world = createWorld(Time, SpatialHashMap({ value: new SpatialHashMapImpl(5) }));
