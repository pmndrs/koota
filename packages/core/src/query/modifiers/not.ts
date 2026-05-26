import { $internal } from '../../common';
import { isRelation } from '../../relation/utils/is-relation';
import type { ExtractTraits, TraitOrRelation } from '../../trait/types';
import type { Modifier } from '../types';
import { createModifier } from '../modifier';

export const Not = <T extends TraitOrRelation[] = TraitOrRelation[]>(...inputs: T): Modifier<ExtractTraits<T>, 'not'> => {
    const traits = inputs.map((input) =>
            isRelation(input) ? input[$internal].trait : input
    ) as ExtractTraits<T>;
    return createModifier('not', 1, traits);
};
