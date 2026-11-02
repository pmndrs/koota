import { $internal } from '../../common';
import { isRelation } from '../../relation/utils/is-relation';
import type { ExtractTraits, TraitOrRelation } from '../../trait/types';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';

/**
 * Tracks entities destroyed while holding the traits. Removing a trait first is not a destroy. The
 * entities are readable until the world collects, so the query only sees them on a world created
 * with manual collection.
 */
export function createDestroyed() {
  const id = createTrackingId();

  return <T extends TraitOrRelation[]>(
    ...inputs: T
  ): Modifier<ExtractTraits<T>, `destroyed-${number}`> => {
    const traits = inputs.map((input) =>
      isRelation(input) ? input[$internal].trait : input
    ) as ExtractTraits<T>;
    return createModifier(`destroyed-${id}`, id, traits);
  };
}
