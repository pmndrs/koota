import { $internal } from '../common';
import type { Trait } from './types';

/** Resolve defaults only for missing fields, or merge a patch into existing state. */
export function resolveTraitValue(trait: Trait, value: any, previous?: any): any {
  if (trait[$internal].type === 'aos') return value;
  if (previous !== undefined) return { ...previous, ...value };

  const candidate: Record<string, any> = {};
  for (const key in trait.schema) {
    const initial = trait.schema[key];
    candidate[key] =
      value != null && key in value
        ? value[key]
        : typeof initial === 'function'
          ? initial()
          : initial;
  }
  return candidate;
}
