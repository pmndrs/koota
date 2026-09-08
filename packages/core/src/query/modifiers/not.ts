import type { ExtractTraits, TraitOrRelation } from '../../trait/types';
import type { Modifier } from '../types';
import { createModifier, internModifier } from '../modifier';

function buildNot(id: number, inputs: readonly TraitOrRelation[]): Modifier {
  return createModifier('not', id, inputs);
}

export const Not = <T extends TraitOrRelation[] = TraitOrRelation[]>(
  ...inputs: T
): Modifier<ExtractTraits<T>, 'not'> =>
  internModifier(1, inputs, buildNot) as Modifier<ExtractTraits<T>, 'not'>;
