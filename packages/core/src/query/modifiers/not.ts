import { Trait } from '../../trait/types';
import { ModifierData } from '../modifier';

export const Not = <T extends Trait[] = Trait[]>(...traits: T) => new ModifierData('not', 1, traits);
