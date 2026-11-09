import { createWorld } from 'koota/entity-methods';
import { Time } from './trait/Time';

export const world = createWorld();
world.add(Time);
