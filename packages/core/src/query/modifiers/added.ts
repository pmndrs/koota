import type { RelationPair } from '../../relation/types';
import type { ExtractModifierTraits, TraitInput } from '../../trait/types';
import { internModifier, type ModifierCache } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';

export function createAdded() {
  const id = createTrackingId();
  const type = `added-${id}` as const;
  const cache: ModifierCache = new WeakMap();

  return <T extends (TraitInput | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `added-${number}`> => {
    return internModifier(cache, type, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `added-${number}`
    >;
  };
}
