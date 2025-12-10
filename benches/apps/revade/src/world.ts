import { createWorld } from 'koota';
import { Keyboard, SpatialHashMap, Time } from './traits';

export const world = createWorld(Time, Keyboard, SpatialHashMap);
