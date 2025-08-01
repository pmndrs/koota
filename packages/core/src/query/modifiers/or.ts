import type { Trait } from '../../trait/types';
import { createModifier } from '../modifier';

export const Or = <T extends Trait[] = Trait[]>(...traits: T) => {
	return createModifier('or', 2, traits);
};
