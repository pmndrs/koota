import { $internal, type Entity, type TagTrait, type World } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTag(target: Entity | World | undefined | null, tag: TagTrait): boolean {
    const contextWorld = useWorld();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    const memo = useMemo(
        () => (target ? createSubscriptions(target, tag, contextWorld) : undefined),
        [target, tag, contextWorld]
    );

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

function createSubscriptions(target: Entity | World, tag: TagTrait, contextWorld: World) {
    const world = isWorld(target) ? target : contextWorld;
    const entity = isWorld(target) ? target[$internal].worldEntity : target;

    return {
        entity,
        subscribe: (setValue: (value: boolean) => void) => {
            const onAddUnsub = world.onAdd(tag, (e) => {
                if (e === entity) setValue(true);
            });

            const onRemoveUnsub = world.onRemove(tag, (e) => {
                if (e === entity) setValue(false);
            });

            setValue(entity.has(tag));

            return () => {
                onAddUnsub();
                onRemoveUnsub();
            };
        },
    };
}
