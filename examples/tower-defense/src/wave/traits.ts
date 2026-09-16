import { trait } from 'koota';

export const Wave = trait(() => ({
  number: 0,
  nextGroupAt: 1.5,
  emittedPerLane: 0,
  intermission: false,
  finished: false,
}));
