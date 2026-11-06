import { type Entity, type TagTrait, type World } from '@koota/core';
import { type MaybeGetter } from '../utils/resolve.js';
import { useHas } from './use-has.svelte.js';

export function useTag(
  target: () => Entity | World | undefined | null,
  tag: MaybeGetter<TagTrait>
): { readonly current: boolean } {
  return useHas(target, tag);
}
