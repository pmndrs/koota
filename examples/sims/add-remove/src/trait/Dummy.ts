import { type Trait, trait } from 'koota';
import { CONSTANTS } from '../constants';

export const DummyComponents = [] as Trait[];

for (let i = 0; i < CONSTANTS.COMPONENTS; i++) {
    DummyComponents.push(trait());
}
