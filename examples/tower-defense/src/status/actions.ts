import { createActions } from 'koota';
import { StatusHits, type StatusHit } from './traits';

export const statusActions = createActions((world) => ({
  queueEffect: (hit: StatusHit) => world.get(StatusHits)!.push(hit),
}));
