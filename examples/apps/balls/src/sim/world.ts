import { createWorld } from 'koota';
import { Pointer, Time, Wall } from './traits';

export const world = createWorld(Time, Pointer, Wall);
