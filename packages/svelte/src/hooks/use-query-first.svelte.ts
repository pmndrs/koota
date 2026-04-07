import type { Entity, QueryParameter } from '@koota/core';
import { useQuery } from './use-query.svelte';

export function useQueryFirst<T extends QueryParameter[]>(
    params: () => [...T]
): { readonly current: Entity | undefined } {
    const query = useQuery(params);

    return {
        get current() {
            return query.current[0];
        },
    };
}
