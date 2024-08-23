import { define } from 'koota';
import { CONSTANTS } from '../constants';

export const DummyComponents = [] as Koota.Component[];

for (let i = 0; i < CONSTANTS.COMPONENTS; i++) {
	DummyComponents.push(define());
}
