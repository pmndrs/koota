import type { Trait } from '../../trait/types';
import type { ModifierData } from '../types';
import { createModifier } from '../modifier';

export const Or = <T extends Trait[] = Trait[]>(...traits: T): ModifierData<T, 'or'> => {
	return createModifier('or', 2, traits);
};
