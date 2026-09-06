import { type Entity, type TagTrait, type World } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { getTargetEntity } from '../utils/get-target-entity';

export function useTag(target: Entity | World | undefined | null, tag: TagTrait): boolean {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const memo = useMemo(() => (target ? createSubscriptions(target, tag) : undefined), [target, tag]);

  const valueRef = useRef<boolean>(false);
  const memoRef = useRef(memo);

  // Update cached value when memo changes
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(tag) ?? false;
  }

  useEffect(() => {
    if (!memo) {
      valueRef.current = false;
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

function createSubscriptions(target: Entity | World, tag: TagTrait) {
  const entity = getTargetEntity(target);

  return {
    entity,
    subscribe: (setValue: (value: boolean) => void) => {
      const onAddUnsub = entity.onAdd(tag, () => setValue(true));
      const onRemoveUnsub = entity.onRemove(tag, () => setValue(false));

      setValue(entity.has(tag));

      return () => {
        onAddUnsub();
        onRemoveUnsub();
      };
    },
  };
}
