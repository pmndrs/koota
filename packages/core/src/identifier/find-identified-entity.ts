import type { Entity } from '../entity/types';
import { IsExcluded } from '../query/query';
import type { QueryParameter } from '../query/types';
import { hasTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import type { WorldContext } from '../world';
import { isIdentifierPair } from './identifier';

/**
 * An entity is a match, undefined is a known miss, and null delegates to the query engine.
 * Keys stored with one owner combined with trait or identifier presence use this path.
 */
export function findIdentifiedEntity(
  ctx: WorldContext,
  params: QueryParameter[]
): Entity | undefined | null {
  let entity: Entity | undefined;
  let matches = true;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (typeof param === 'function') continue;
    if (!isIdentifierPair(param)) return null;
    const owner = ctx.traitInstances[param.identifier.id]?.identifier?.owners.get(param.target);
    if (typeof owner === 'object') return null;
    // Inspect every term even after a miss so tracking modifiers still initialize their query.
    if (owner === undefined || (entity !== undefined && entity !== owner)) matches = false;
    entity = owner;
  }
  if (!matches) return;
  if (entity === undefined) return null;
  if (hasTrait(ctx, entity, IsExcluded)) return;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    // Identifiers share their backing trait's id, which is all the membership check needs.
    if (typeof param === 'function' && !hasTrait(ctx, entity, param as Trait)) return;
  }
  return entity;
}
