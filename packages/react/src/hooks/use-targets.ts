import { type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { getTargetEntity } from '../utils/get-target-entity';

export function useTargets<T extends Trait>(
  target: Entity | World | undefined | null,
  relation: Relation<T>
): Entity[] {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const memo = useMemo(
    () => (target ? createSubscriptions(target, relation) : undefined),
    [target, relation]
  );

  const valueRef = useRef<Entity[]>([]);
  const memoRef = useRef(memo);

  // Update cached value when memo changes
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetsFor(relation) ?? [];
  }

  useEffect(() => {
    if (!memo) {
      valueRef.current = [];
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
    subscribe: (setValue: (value: Entity[]) => void) => {
      // Track current value for onRemove filter
      let currentValue: Entity[] = [];

      const update = (value: Entity[]) => {
        currentValue = value;
        setValue(value);
      };

      const onAddUnsub = entity.onAdd(relation, () => update(entity.targetsFor(relation)));

      // onRemove fires before data is removed, so filter out the target
      const onRemoveUnsub = entity.onRemove(relation, (_, t) => {
        update(currentValue.filter((p) => p !== t));
      });

      const onChangeUnsub = entity.onChange(relation, () => update(entity.targetsFor(relation)));

      update(entity.targetsFor(relation));

      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    },
  };
}
