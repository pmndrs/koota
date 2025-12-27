import { createWorld } from 'koota';
import { Pointer, Time, Viewport } from './traits';

export const world = createWorld(Time, Pointer, Viewport);

