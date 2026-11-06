import type { RelationPair } from '../../relation/types';
import type { ExtractModifierTraits, TraitInput } from '../../trait/types';
import { internModifier, type ModifierCache } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';

export function createRemoved() {
  const id = createTrackingId();
  const type = `removed-${id}` as const;
  const cache: ModifierCache = new WeakMap();

  return <T extends (TraitInput | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `removed-${number}`> => {
    return internModifier(cache, type, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `removed-${number}`
    >;
  };
}
