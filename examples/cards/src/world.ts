import { createWorld } from 'koota/entity-methods';
import { Pointer, Time, Viewport } from './traits';

export const world = createWorld();
world.add(Time, Pointer, Viewport);
