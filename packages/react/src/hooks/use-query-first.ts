import type { Entity, QueryParameter } from '@koota/core';
import { useWorld } from '../world/use-world';
import { useQuery } from './use-query';

export function useQueryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined {
    const world = useWorld();
    useQuery(...parameters);
    return world.queryFirst(...parameters);
}
