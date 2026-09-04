import { type Entity, type TagTrait, type World } from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { isWorld } from '../utils/is-world.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTag(
  target: () => Entity | World | undefined | null,
  tag: MaybeGetter<TagTrait>
): { readonly current: boolean } {
  const contextWorld = useWorld();
  const initialEntity = getTargetEntity(target());
  let value = $state(initialEntity?.has(resolve(tag)) ?? false);

  $effect(() => {
    const t = target();

    if (!t) {
      value = false;
      return;
    }

    const resolvedTag = resolve(tag);
    const world = isWorld(t) ? t : contextWorld;

    let entity: Entity;

    /**
     * Subscribe before reading worldEntity: world.onAdd triggers lazy
     * registration so worldEntity is guaranteed to exist after this.
     */
    const onAddUnsub = world.onAdd(resolvedTag, (e) => {
      if (e === entity) value = true;
    });

    const onRemoveUnsub = world.onRemove(resolvedTag, (e) => {
      if (e === entity) value = false;
    });

    entity = getTargetEntity(t)!;
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
