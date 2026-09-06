import { type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { getTargetEntity } from '../utils/get-target-entity';

export function useTarget<T extends Trait>(
  target: Entity | World | undefined | null,
  relation: Relation<T>
): Entity | undefined {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const memo = useMemo(
    () => (target ? createSubscriptions(target, relation) : undefined),
    [target, relation]
  );

  const valueRef = useRef<Entity | undefined>(undefined);
  const memoRef = useRef(memo);

  // Update cached value when memo changes
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetFor(relation);
  }

  useEffect(() => {
    if (!memo) {
      valueRef.current = undefined;
      forceUpdate();
      return;
    }

    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });

    return () => unsubscribe();
  }, [memo]);

  return valueRef.current;
}

function createSubscriptions<T extends Trait>(target: Entity | World, relation: Relation<T>) {
  const entity = getTargetEntity(target);

  return {
    entity,
    subscribe: (setValue: (value: Entity | undefined) => void) => {
      const onAddUnsub = entity.onAdd(relation, () => setValue(entity.targetFor(relation)));
      const onRemoveUnsub = entity.onRemove(relation, () => setValue(undefined));
      const onChangeUnsub = entity.onChange(relation, () => setValue(entity.targetFor(relation)));

      setValue(entity.targetFor(relation));

      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    },
  };
}
