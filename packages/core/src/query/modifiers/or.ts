import { Trait } from '../../trait/types';
import { ModifierData } from '../modifier';

export const Or = <T extends Trait[] = Trait[]>(...traits: T) => new ModifierData('or', 2, traits);
