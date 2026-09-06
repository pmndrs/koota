import {
  shallowEqual,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { getTargetEntity } from '../utils/get-target-entity';
import { useStableTrait } from '../utils/use-stable-pair';

/**
 * Making sure the values are never stale requires syncing at each boundary.
 *
 * - Render: Read the current trait snapshot synchronously.
 * - Effect: Update again after subscribing at effect time. This catches any
 *   changes that happen after render but before effect.
 * - Subscribe: Whenever the trait value changes in the world.
 */

export function useTrait<T extends Trait>(
  target: Entity | World | undefined | null,
  trait: T | RelationPair<T>
): TraitRecord<T> | undefined {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const valueRef = useRef<TraitRecord<T> | undefined>(undefined);
  const memoRef = useRef<ReturnType<typeof createSubscriptions<T>> | undefined>(undefined);
  const stableTrait = useStableTrait(trait);

  const memo = useMemo(
    () => (target ? createSubscriptions(target, stableTrait) : undefined),
    [target, stableTrait]
  );

  // Reads the trait value synchronously
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(stableTrait) ? memo.entity.get(stableTrait) : undefined;
  }

  useEffect(() => {
    if (!memo) return;

    let initialized = false;
    const unsub = memo.subscribe((value) => {
      if (!initialized) {
        // Skip the initial sync call if the value is the same
        // reference already read during render.
        initialized = true;
        if (shallowEqual(value, valueRef.current)) return;
      }
      valueRef.current = value;
      forceUpdate();
    });

    return () => unsub();
  }, [memo]);

  return valueRef.current;
}

function createSubscriptions<T extends Trait>(target: Entity | World, trait: T | RelationPair<T>) {
  const entity = getTargetEntity(target);

  return {
    entity,
    subscribe: (setValue: (value: TraitRecord<T> | undefined) => void) => {
      const onChangeUnsub = entity.onChange(trait, () => setValue(entity.get(trait)));
      const onAddUnsub = entity.onAdd(trait, () => setValue(entity.get(trait)));
      const onRemoveUnsub = entity.onRemove(trait, () => setValue(undefined));

      // Set initial value
      setValue(entity.has(trait) ? entity.get(trait) : undefined);

      return () => {
        onChangeUnsub();
        onAddUnsub();
        onRemoveUnsub();
      };
    },
  };
}
