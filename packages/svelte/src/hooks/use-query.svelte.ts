import {
    $internal as internal,
    createQuery,
    type QueryParameter,
    type QueryResult,
} from '@koota/core';
import { useWorld } from '../world/world-context';

export function useQuery<T extends QueryParameter[]>(
    ...args: [...T] | [() => [...T]]
): { readonly current: QueryResult<T> } {
    const getParams =
        args.length === 1 && typeof args[0] === 'function' && !(internal in args[0])
            ? (args[0] as () => [...T])
            : () => args as unknown as [...T];

    const world = useWorld();
    let result = $state.raw<QueryResult<T>>([] as unknown as QueryResult<T>);
    let resetCount = $state(0);

    $effect(() => {
        // Track resetCount so the effect re-runs on world reset
        void resetCount;

        const queryRef = createQuery(...getParams());

        result = world.query(queryRef).sort();

        const update = () => {
            result = world.query(queryRef).sort();
        };

        const unsubAdd = world.onQueryAdd(queryRef, update);
        const unsubRemove = world.onQueryRemove(queryRef, update);

        const handleReset = () => {
            resetCount++;
        };

        world[internal].resetSubscriptions.add(handleReset);

        return () => {
            world[internal].resetSubscriptions.delete(handleReset);
            unsubAdd();
            unsubRemove();
        };
    });

    return {
        get current() {
            return result;
        },
    };
}
