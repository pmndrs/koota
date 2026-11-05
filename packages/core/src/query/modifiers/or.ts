import type { RelationPair } from '../../relation/types';
import type { TraitInput } from '../../trait/types';
import type { Modifier, OrModifier, OrParameter } from '../types';
import { $modifier, createModifier } from '../modifier';

export const Or = <T extends OrParameter[]>(...params: T): OrModifier<T> => {
  // Separate nested modifiers from the traits and relation pairs
  const inputs: (TraitInput | RelationPair)[] = [];
  const modifiers: Modifier[] = [];

  for (const param of params) {
    if ((param as Modifier)[$modifier]) modifiers.push(param as Modifier);
    else inputs.push(param as TraitInput | RelationPair);
  }

  const modifier = createModifier('or', 2, inputs) as unknown as OrModifier<T>;
  if (modifiers.length !== 0) modifier.modifiers = modifiers;

  return modifier;
};
