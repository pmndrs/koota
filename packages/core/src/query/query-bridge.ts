import type { Entity } from '../entity/types';
import type { WorldContext } from '../world';
import type { Query, QueryParameter, QueryResult } from './types';

type QueryFn = (ctx: WorldContext, ...args: any[]) => QueryResult<any>;
type SubscribeFn = (
    ctx: WorldContext,
    args: Query<QueryParameter[]> | QueryParameter[],
    callback: (entity: Entity) => void
) => () => void;

let _query: QueryFn;
let _subAdd: SubscribeFn;
let _subRemove: SubscribeFn;

export function _setQueryBridge(queryFn: QueryFn, subAddFn: SubscribeFn, subRemoveFn: SubscribeFn) {
    _query = queryFn;
    _subAdd = subAddFn;
    _subRemove = subRemoveFn;
}

export function queryInternal<T extends QueryParameter[]>(
    ctx: WorldContext,
    ...args: [Query<T>] | T
): QueryResult<T> {
    return _query(ctx, ...args) as QueryResult<T>;
}

export function subscribeQueryAdd(
    ctx: WorldContext,
    args: Query<QueryParameter[]> | QueryParameter[],
    callback: (entity: Entity) => void
): () => void {
    return _subAdd(ctx, args, callback);
}

export function subscribeQueryRemove(
    ctx: WorldContext,
    args: Query<QueryParameter[]> | QueryParameter[],
    callback: (entity: Entity) => void
): () => void {
    return _subRemove(ctx, args, callback);
}
