import { createRelation, type Schema } from '../../kernel';
import type { Trait, TraitHooks } from '../trait/types';
import type { Relation } from './types';

export function relation<S extends Schema = Record<string, never>>(definition?: {
  exclusive?: boolean;
  autoDestroy?: 'orphan' | 'source' | 'target';
  /** @deprecated Use `autoDestroy: 'orphan'` instead */
  autoRemoveTarget?: boolean;
  store?: S;
  hooks?: TraitHooks<S>;
}): Relation<Trait<S>> {
  return createRelation(definition) as unknown as Relation<Trait<S>>;
}
