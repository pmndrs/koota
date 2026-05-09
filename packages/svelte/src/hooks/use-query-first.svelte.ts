import type { Entity, QueryParameter } from '@koota/core';
import { useQuery } from './use-query.svelte';

export function useQueryFirst<T extends QueryParameter[]>(
    ...args: [...T] | [() => [...T]]
): { readonly current: Entity | undefined } {
    const query = useQuery(...args);

    return {
        get current() {
            return query.current[0];
        },
    };
}
