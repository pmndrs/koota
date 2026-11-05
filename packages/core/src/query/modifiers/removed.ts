import type { RelationPair } from '../../relation/types';
import type { ExtractModifierTraits, TraitInput } from '../../trait/types';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';

export function createRemoved() {
  const id = createTrackingId();

  return <T extends (TraitInput | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `removed-${number}`> => {
    return createModifier(`removed-${id}`, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `removed-${number}`
    >;
  };
}
