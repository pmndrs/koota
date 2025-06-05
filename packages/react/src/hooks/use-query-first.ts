import type { Entity, QueryParameter } from '@koota/core';
import { useQuery } from './use-query';

export function useQueryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined {
	const query = useQuery(...parameters);
	return query[0];
}
