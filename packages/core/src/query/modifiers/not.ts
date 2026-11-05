import type { RelationPair } from '../../relation/types';
import type { ExtractModifierTraits, TraitInput } from '../../trait/types';
import type { Modifier } from '../types';
import { createModifier } from '../modifier';

export const Not = <T extends (TraitInput | RelationPair)[] = TraitInput[]>(
  ...inputs: T
): Modifier<ExtractModifierTraits<T>, 'not'> => {
  return createModifier('not', 1, inputs) as Modifier<ExtractModifierTraits<T>, 'not'>;
};
