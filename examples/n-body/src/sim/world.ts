import { createWorld } from 'koota/entity-methods';
import { Time } from './traits/Time';

export const world = createWorld();
world.add(Time);
