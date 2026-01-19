import { createWorld } from 'koota';
import { Time, Pointer, History } from './traits';

export const world = createWorld(Time, Pointer, History);
