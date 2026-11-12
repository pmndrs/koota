import { type TagTrait, trait } from 'koota';
import { CONSTANTS } from '../constants';

export const DummyComponents: TagTrait[] = [];

for (let i = 0; i < CONSTANTS.COMPONENTS; i++) {
  DummyComponents.push(trait());
}
