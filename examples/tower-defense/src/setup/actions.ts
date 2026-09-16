import { createActions } from 'koota';
import { mulberry32 } from 'math/random';
import { Random } from './traits';

export const randomActions = createActions((world) => ({
  next: () => mulberry32.sample(world.get(Random)!),
}));
