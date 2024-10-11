import { createWorld } from 'koota';
import { Time } from './trait/Time';

export const world = createWorld({ resources: [Time] });
