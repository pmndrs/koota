import { type Entity, type TagTrait, type World } from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTag(
  target: () => Entity | World | undefined | null,
  tag: MaybeGetter<TagTrait>
): { readonly current: boolean } {
  const initialEntity = getTargetEntity(target());
  let value = $state(initialEntity?.has(resolve(tag)) ?? false);

  $effect(() => {
    const entity = getTargetEntity(target());

    if (entity === undefined) {
      value = false;
      return;
    }

    const resolvedTag = resolve(tag);

    const onAddUnsub = entity.onAdd(resolvedTag, () => {
      value = true;
    });

    const onRemoveUnsub = entity.onRemove(resolvedTag, () => {
      value = false;
    });

    value = entity.has(resolvedTag);

    return () => {
      onAddUnsub();
      onRemoveUnsub();
    };
  });

  return {
    get current() {
      return value;
    },
  };
}
