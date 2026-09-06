import type { Entity, TagTrait, World } from '@koota/core';
import { useHas } from './use-has';

export function useTag(target: Entity | World | undefined | null, tag: TagTrait): boolean {
  return useHas(target, tag);
}
