import {
  $internal as internal,
  type Entity,
  type Identifier,
  type IdentifierKey,
  type Relation,
  type Trait,
  type World,
} from '@koota/core';
import { getTargetEntity, observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

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
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<IdentifierKey | undefined>(
    initialEntity?.targetFor(resolve(relation) as Relation<Trait>)
  );

  $effect(() => {
    const subject = target();
    const resolvedRelation = resolve(relation);
    return observeTarget(subject, (entity) => {
      if (entity === undefined) {
        value = undefined;
        return;
      }

      const update = () => {
        value = entity.isAlive() ? entity.targetFor(resolvedRelation as Relation<Trait>) : undefined;
      };
      const observer = entity[internal].observeSettled(update);
      const onChange = entity.onChange(resolvedRelation[internal].trait, observer.invalidate);
      const onRemove = entity.onRemove(resolvedRelation[internal].trait, observer.invalidate);
      update();
      return () => {
        observer.unsubscribe();
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
