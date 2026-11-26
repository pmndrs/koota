import {
  $internal as internal,
  isOrderedTrait,
  type Entity,
  type OrderedTrait,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { getTargetEntity, subscribeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

type TraitSnapshot<T extends Trait> =
  (T extends OrderedTrait ? readonly Entity[] : TraitRecord<T>) | undefined;

export function useTrait<T extends Trait>(
  target: () => Entity | World | undefined | null,
  trait: T
): { readonly current: TraitSnapshot<T> };
export function useTrait<T extends Trait>(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<T | RelationPair<T>>
): { readonly current: TraitSnapshot<T> };
export function useTrait(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair>
) {
  const { getOrderedSnapshot } = useWorld()[internal];
  const binding = $derived.by(() => {
    const subject = target();
    if (subject == null) return;
    const input = resolve(trait);
    const ordered = isOrderedTrait(input);
    const read = (entity: Entity | undefined) => {
      const record = entity?.isAlive() ? entity.get(input) : undefined;
      return ordered ? getOrderedSnapshot(record) : record;
    };
    return { subject, input, ordered, read, value: read(getTargetEntity(subject)) };
  });
  // In-place AoS writes need a notification even when the record is the same object.
  let version = $state(0);

  $effect(() => {
    const current = binding;
    if (!current) return;
    return subscribeTarget(current.subject, (entity) => {
      const update = () => {
        const next = current.read(entity);
        if (current.ordered && next === current.value) return;
        current.value = next;
        untrack(() => version++);
      };
      if (entity === undefined) {
        update();
        return;
      }
      const observer = entity[internal].observeSettled(update);
      const onChange = entity.onChange(current.input, observer.invalidate);
      const onRemove = entity.onRemove(current.input, observer.invalidate);
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
      void version;
      return binding?.value;
    },
  };
}
