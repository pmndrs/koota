import { isModifier } from '../query/modifier';
import { isRelationPair } from '../relation/utils/is-relation';
import { hasTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { IsExcluded, resolveQueryInstance } from '../query/query';
import { createQueryResult, createRelationOnlyQueryResult } from '../query/query-result';
import type { QueryParameter, QueryResult } from '../query/types';
import type { Entity } from '../entity/types';
import type { WorldContext } from '../world';
import { isNameConfig } from './name-index';

/**
 * Resolves a query that carries a name filter through the name index instead
 * of the query engine. A name belongs to at most one entity, so the result is
 * that entity checked against the remaining parameters. Returns undefined when
 * no parameter is a name config so the caller falls through to the normal path.
 */
export function queryByName<T extends QueryParameter[]>(
  ctx: WorldContext,
  params: QueryParameter[]
): QueryResult<T> | undefined {
  // Scan without allocating so queries with no name config pay one loop.
  let name: string | undefined;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (!isNameConfig(param)) continue;
    // Two different names can never match the same entity.
    if (name !== undefined && name !== param[1].value) return createRelationOnlyQueryResult([]);
    name = param[1].value;
  }

  if (name === undefined) return undefined;

  // Excluded entities never appear in query results, whichever path resolves them.
  const owner = ctx.names.get(name);
  const entity = owner !== undefined && !hasTrait(ctx, owner, IsExcluded) ? owner : undefined;
  if (params.length === 1) return createNamedResult<T>(ctx, entity);

  const rest: QueryParameter[] = [];
  let traitsOnly = true;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (isNameConfig(param)) continue;
    rest.push(param);
    if (isModifier(param) || isRelationPair(param)) traitsOnly = false;
  }
  if (rest.length === 0) return createNamedResult<T>(ctx, entity);

  // Plain traits can be checked on the named entity without building a world-wide query.
  if (traitsOnly) {
    if (entity === undefined) return createRelationOnlyQueryResult([]);
    for (let i = 0; i < rest.length; i++) {
      if (!hasTrait(ctx, entity, rest[i] as Trait)) return createRelationOnlyQueryResult([]);
    }
    return createQueryResult<T>(ctx, [entity], null, rest);
  }

  const instance = resolveQueryInstance(ctx, params);
  return instance.run(ctx, params) as QueryResult<T>;
}

/** A full result so select still works when the query named no other traits. */
function createNamedResult<T extends QueryParameter[]>(
  ctx: WorldContext,
  entity: Entity | undefined
): QueryResult<T> {
  if (entity === undefined) return createRelationOnlyQueryResult([]);
  return createQueryResult<T>(ctx, [entity], null, []);
}
