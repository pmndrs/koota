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
import { createTargetResolver, observeTarget } from '../utils/get-target-entity.js';
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
  const resolveTarget = createTargetResolver();
  const initial = resolveTarget(target());
  let value = $state.raw<IdentifierKey | undefined>(
    initial && initial.world.targetFor(initial.entity, resolve(relation) as Relation<Trait>)
  );

  $effect(() => {
    const subject = target();
    const resolvedRelation = resolve(relation);
    return observeTarget(resolveTarget, subject, (resolved) => {
      if (resolved === undefined) {
        value = undefined;
        return;
      }

      const { world, entity } = resolved;
      const update = () => {
        value = world.has(entity)
          ? world.targetFor(entity, resolvedRelation as Relation<Trait>)
          : undefined;
      };
      const observer = world[internal].observeSettled(update);
      const onChange = world.onChange(entity, resolvedRelation[internal].trait, observer.invalidate);
      const onRemove = world.onRemove(entity, resolvedRelation[internal].trait, observer.invalidate);
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
