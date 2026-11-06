import { createWorld } from 'koota/entity-methods';
import { Pointer, Time, Wall } from './traits';

export const world = createWorld();
world.add(Time, Pointer, Wall);
