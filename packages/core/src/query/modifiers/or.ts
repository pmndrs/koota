import { $internal } from '../../common';
import { isRelation } from '../../relation/utils/is-relation';
import type { Trait, TraitOrRelation } from '../../trait/types';
import type { Modifier, OrModifier, OrParameter } from '../types';
import { $modifier, createModifier, internModifier } from '../modifier';

function buildOr(id: number, inputs: readonly TraitOrRelation[]): Modifier {
  // Separate traits from nested modifiers
  const traits: Trait[] = [];
  const modifiers: Modifier[] = [];

  for (const param of inputs as readonly OrParameter[]) {
    if ((param as Modifier)[$modifier]) {
      modifiers.push(param as Modifier);
    } else {
      traits.push(isRelation(param) ? param[$internal].trait : (param as Trait));
    }
  }

  const modifier = createModifier('or', id, traits) as OrModifier;
  modifier.modifiers = modifiers;

  return modifier;
}

export const Or = <T extends OrParameter[]>(...params: T): OrModifier<T> =>
  internModifier(2, params as unknown as TraitOrRelation[], buildOr) as OrModifier<T>;
