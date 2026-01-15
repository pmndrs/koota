import { $internal, createQuery, type QueryParameter, type QueryResult } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T> {
    const world = useWorld();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    const queryRef = useMemo(() => createQuery(...parameters), parameters);
    const cacheRef = useRef<{ hash: string; version: number; result: QueryResult<T> } | null>(null);

    // Compute result: uses cache if valid, otherwise recomputes
    const getResult = (): QueryResult<T> => {
        const query = world[$internal].queriesHashMap.get(queryRef.hash);

        if (
            query &&
            cacheRef.current?.hash === queryRef.hash &&
            cacheRef.current.version === query.version
        ) {
            return cacheRef.current.result;
        }

        const result = world.query(queryRef).sort();
        const registeredQuery = world[$internal].queriesHashMap.get(queryRef.hash)!;
        cacheRef.current = { hash: queryRef.hash, version: registeredQuery.version, result };

        return result;
    };

    const result = getResult();

    useEffect(() => {
        const update = () => forceUpdate();

        let unsubAdd = () => {};
        let unsubRemove = () => {};

        const subscribe = () => {
            unsubAdd = world.onQueryAdd(queryRef, update);
            unsubRemove = world.onQueryRemove(queryRef, update);

            // Check if query changed between render and effect
            const query = world[$internal].queriesHashMap.get(queryRef.hash)!;
            if (cacheRef.current && query.version !== cacheRef.current.version) {
                update();
            }
        };

        const handleReset = () => {
            cacheRef.current = null;
            unsubAdd();
            unsubRemove();
            subscribe();
            update();
        };

        subscribe();
        world[$internal].resetSubscriptions.add(handleReset);

        return () => {
            world[$internal].resetSubscriptions.delete(handleReset);
            unsubAdd();
            unsubRemove();
        };
    }, [world, queryRef]);

    return result;
}
