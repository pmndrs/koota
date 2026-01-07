import { $internal, type Entity, type TagTrait, type World } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTag(target: Entity | World | undefined | null, tag: TagTrait): boolean {
    const contextWorld = useWorld();

    const memo = useMemo(
        () => (target ? createSubscriptions(target, tag, contextWorld) : undefined),
        [target, tag, contextWorld]
    );

    const [value, setValue] = useState<boolean>(() => {
        return memo?.entity.has(tag) ?? false;
    });

    // Track memo changes and compute correct value for this render
    const memoRef = useRef(memo);

    let currentValue = value;
    if (memoRef.current !== memo) {
        memoRef.current = memo;
        currentValue = memo?.entity.has(tag) ?? false;
        if (currentValue !== value) setValue(currentValue);
    }

    useEffect(() => {
        if (!memo) {
            setValue(false);
            return;
        }

        const unsubscribe = memo.subscribe(setValue);
        return () => unsubscribe();
    }, [memo]);

    return currentValue;
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
