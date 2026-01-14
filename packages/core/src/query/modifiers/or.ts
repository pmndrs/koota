import type { Trait } from '../../trait/types';
import type { Modifier } from '../types';
import { createModifier } from '../modifier';

export const Or = <T extends Trait[] = Trait[]>(...traits: T): Modifier<T, 'or'> => {
    return createModifier('or', 2, traits);
};
