import {
  whenSettled,
  $internal as internal,
  type Entity,
  type Identifier,
  type IdentifierKey,
  type Relation,
  type Trait,
  type World,
} from '@koota/core';
import { getTargetEntity, subscribeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTarget<K extends IdentifierKey>(
  target: () => Entity | World | undefined | null,
  identifier: MaybeGetter<Identifier<K>>
): { readonly current: K | undefined };
export function useTarget<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity | undefined };
export function useTarget(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<Trait> | Identifier>
): { readonly current: IdentifierKey | undefined } {
  useWorld();
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<IdentifierKey | undefined>(
    initialEntity?.targetFor(resolve(relation) as Relation<Trait>)
  );

  $effect(() => {
    const subject = target();
    const resolvedRelation = resolve(relation);
    return subscribeTarget(subject, (entity) => {
      if (entity === undefined) {
        value = undefined;
        return;
      }

      const update = () => {
        value = entity.isAlive() ? entity.targetFor(resolvedRelation as Relation<Trait>) : undefined;
      };
      const refresh = whenSettled(update);
      const onChange = entity.onChange(resolvedRelation[internal].trait, refresh);
      const onRemove = entity.onRemove(resolvedRelation[internal].trait, refresh);
      update();
      return () => {
        onChange();
        onRemove();
      };
    });
  });

  return {
    get current() {
      return value;
    },
  };
}
