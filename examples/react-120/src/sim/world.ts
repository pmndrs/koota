import { createWorld } from 'koota';
import { Pointer, Time, Wall } from './traits';

export const world = createWorld();
world.add(Time, Pointer, Wall);
