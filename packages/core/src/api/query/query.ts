import { trait } from '../trait/trait';
import { createQuery as createQueryDescriptor, runQuery, type KernelContext } from '../../kernel';
import type { Entity } from '../entity/types';
import type { Query, QueryInstance, QueryParameter, QueryResult } from './types';
import { createQueryResult } from './query-result';

export const IsExcluded = trait();

export function createQuery<T extends QueryParameter[]>(...parameters: T): Query<T> {
  return createQueryDescriptor(...parameters) as Query<T>;
}

export function runQueryResult<T extends QueryParameter[]>(
  ctx: KernelContext,
  query: QueryInstance,
  params: T
): QueryResult<T> {
  return createQueryResult(ctx, runQuery(ctx, query) as Entity[], query, params);
}
