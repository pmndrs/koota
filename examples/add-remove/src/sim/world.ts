import { createWorld } from 'koota';
import { Time } from './trait/Time';

// Destroyed bodies stay readable until the loop collects, so the view can clear them.
export const world = createWorld({ collect: 'manual' }, Time);
