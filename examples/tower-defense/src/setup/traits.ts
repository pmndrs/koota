import { trait } from 'koota';
import { mulberry32 } from 'math/random';
import { resolveSetup } from './setups';

export const Scenario = trait(() => resolveSetup());
export const Random = trait(() => mulberry32.create(42));
