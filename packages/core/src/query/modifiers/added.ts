import type { RelationPair } from '../../relation/types';
import type { ExtractModifierTraits, TraitOrRelation } from '../../trait/types';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { createTrackingId } from '../utils/tracking-cursor';

export function createAdded() {
  const id = createTrackingId();

  return <T extends (TraitOrRelation | RelationPair)[]>(
    ...inputs: T
  ): Modifier<ExtractModifierTraits<T>, `added-${number}`> => {
    return createModifier(`added-${id}`, id, inputs) as Modifier<
      ExtractModifierTraits<T>,
      `added-${number}`
    >;
  };
}
