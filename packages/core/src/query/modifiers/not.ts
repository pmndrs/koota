import type { Trait } from '../../trait/types';
import { createModifier } from '../modifier';

export const Not = <T extends Trait[] = Trait[]>(...traits: T) => {
	return createModifier('not', 1, traits);
};
