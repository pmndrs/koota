import type { Trait } from '../../trait/types';
import type { ModifierData } from '../types';
import { createModifier } from '../modifier';

export const Not = <T extends Trait[] = Trait[]>(...traits: T): ModifierData<T, 'not'> => {
	return createModifier('not', 1, traits);
};
