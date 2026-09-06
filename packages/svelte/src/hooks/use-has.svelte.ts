import {
  $relationPair as relationPair,
  type Entity,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useHas(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair>
): { readonly current: boolean } {
  const initialEntity = getTargetEntity(target());
  let value = $state(initialEntity?.has(resolve(trait)) ?? false);

  $effect(() => {
    const t = target();

    if (!t) {
      value = false;
      return;
    }

    const resolvedTrait = resolve(trait);
    const entity = getTargetEntity(t)!;

    // Wildcard pairs like ChildOf('*') fire on every pair removal, but the entity
    // may still have other pairs. Since onRemove fires before state cleanup,
    // we check targetsFor().length > 1 (the removed target is still counted).
    const isWildcard =
      !!(resolvedTrait as any)?.[relationPair] && (resolvedTrait as RelationPair).target === '*';
    const wildcardRelation = isWildcard ? (resolvedTrait as RelationPair).relation : undefined;

    const onAddUnsub = entity.onAdd(resolvedTrait, () => {
      value = true;
    });

    const onRemoveUnsub = entity.onRemove(resolvedTrait, () => {
      if (wildcardRelation) {
        value = entity.targetsFor(wildcardRelation).length > 1;
      } else {
        value = false;
      }
    });

    value = entity.has(resolvedTrait);

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
