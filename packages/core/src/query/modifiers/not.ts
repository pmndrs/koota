import type { RelationPair } from '../../relation/types';
import type { ExtractModifierTraits, TraitInput } from '../../trait/types';
import type { Modifier } from '../types';
import { internModifier, type ModifierCache } from '../modifier';

const cache: ModifierCache = new WeakMap();

export const Not = <T extends (TraitInput | RelationPair)[] = TraitInput[]>(
  ...inputs: T
): Modifier<ExtractModifierTraits<T>, 'not'> => {
  return internModifier(cache, 'not', 1, inputs) as Modifier<ExtractModifierTraits<T>, 'not'>;
};
