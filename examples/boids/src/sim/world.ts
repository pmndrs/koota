import { createWorld } from 'koota/entity-methods';
import { Time } from './traits';

export const world = createWorld();
world.add(Time);
