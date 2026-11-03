import type { TraitOrRelation } from '../trait/types';
import { createRemoved } from './modifiers/removed';
import { createQuery } from './query';
import type { QueryParameter } from './types';

/**
 * A cached query key over emitted events. An event is an entity born dead whose traits count as
 * removed, so the listener reads it as a Removed term, and each listener drains on its own.
 */
export function createListener<T extends TraitOrRelation, U extends QueryParameter[]>(
  event: T,
  ...parameters: U
) {
  const Removed = createRemoved();
  return createQuery(Removed(event), ...parameters);
}
