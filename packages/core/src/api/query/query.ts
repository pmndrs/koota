import type { World } from '../world';
import { trait } from '../trait/trait';
import {
  createQuery as createQueryDescriptor,
  runQuery,
  findQueryVersion,
  $internal,
  type KernelContext,
} from '../../kernel';
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

/** Read query membership revision without creating a query or consuming tracking results. */
export function getQueryVersion(world: World, query: Query): number | undefined {
  return findQueryVersion(world[$internal].kernel, query);
}
