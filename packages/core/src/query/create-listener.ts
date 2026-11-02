import type { TraitOrRelation } from '../trait/types';
import { createDestroyed } from './modifiers/destroyed';
import { createQuery } from './query';
import type { QueryParameter } from './types';

/**
 * A cached query key over emitted events. An event is an entity born dead, so the listener reads
 * it as a Destroyed term, and each listener drains on its own.
 */
export function createListener<T extends TraitOrRelation, U extends QueryParameter[]>(
  event: T,
  ...parameters: U
) {
  const Destroyed = createDestroyed();
  return createQuery(Destroyed(event), ...parameters);
}
