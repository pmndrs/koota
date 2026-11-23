import { createWorld } from 'koota';
import { Time } from './traits';

export const world = createWorld();
world.add(Time);
