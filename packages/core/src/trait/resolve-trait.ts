import { $internal } from '../common';
import type { Trait, TraitInput } from './types';

/** Relations and identifiers use a backing trait for presence, queries and subscriptions. */
export function resolveTrait(input: TraitInput): Trait {
  const context = input[$internal];
  return ('trait' in context ? context.trait : input) as Trait;
}
