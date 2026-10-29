import type { Entity } from '../entity/types';
import { IsExcluded } from '../query/query';
import type { QueryParameter } from '../query/types';
import { hasTrait } from '../trait/trait';
import type { WorldContext } from '../world';
import { isNameConfig } from './name-index';

/** Resolve plain named filters through the index. Null falls through to the query engine. */
export function findNamedEntity(
  ctx: WorldContext,
  params: QueryParameter[]
): Entity | undefined | null {
  let name: string | undefined;
  for (const param of params) {
    if (typeof param === 'function') continue;
    if (!isNameConfig(param)) return null;
    if (name !== undefined && name !== param[1]) return;
    name = param[1];
  }
  if (name === undefined) return null;

  const entity = ctx.names.get(name);
  if (entity === undefined || hasTrait(ctx, entity, IsExcluded)) return;
  for (const param of params) {
    if (typeof param === 'function' && !hasTrait(ctx, entity, param)) return;
  }
  return entity;
}
