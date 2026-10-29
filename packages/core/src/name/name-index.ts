import { assertsEnabled } from '../assert-config';
import { createNameTakenError } from '../asserts';
import type { Brand } from '../common';
import type { Entity } from '../entity/types';
import type { TraitInstance } from '../trait/types';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { checkQueryTrackingWithRelations } from '../query/utils/check-query-tracking-with-relations';
import type { WorldContext } from '../world';
import { $name } from './symbols';
import type { NameConfig, NameTrait } from './types';

export /* @inline @pure */ function isNameTrait(value: unknown): value is NameTrait {
  return (value as Brand<typeof $name> | null | undefined)?.[$name] as unknown as boolean;
}

export /* @inline @pure */ function isNameConfig(value: unknown): value is NameConfig {
  return Array.isArray(value) && isNameTrait(value[0]);
}

export function validateName(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Koota: Name requires a non-empty string.');
  }
}

export type NameStore = string[][];

/** Validate ownership without changing the column or name index. */
export function validateNameAssignment(ctx: WorldContext, eid: number, name: unknown): boolean {
  const entity = ctx.entityIndex.dense[ctx.entityIndex.sparse[eid]];
  validateName(name);
  const owner = ctx.names.get(name);
  if (owner !== undefined && owner !== entity) {
    if (assertsEnabled) throw createNameTakenError(name, owner);
    return false;
  }
  return true;
}

/** Rename an attached trait in the column and lookup index together. */
export function renameName(ctx: WorldContext, eid: number, store: NameStore, name: string): boolean {
  const page = store[eid >>> 10];
  const previous = page[eid & 1023];
  if (previous === name) return false;
  const entity = ctx.entityIndex.dense[ctx.entityIndex.sparse[eid]];
  ctx.names.delete(previous);
  ctx.names.set(name, entity);
  page[eid & 1023] = name;
  return true;
}

/** Release ownership while retaining stored data for Removed queries. */
export function releaseName(ctx: WorldContext, eid: number, store: NameStore): void {
  const page = store[eid >>> 10];
  const name = page?.[eid & 1023];
  if (name === undefined) return;
  ctx.names.delete(name);
}

/** Renaming changes query membership even though the Name trait stays attached. */
export function refreshNamedQueries(ctx: WorldContext, entity: Entity, data: TraitInstance) {
  for (const query of data.queries) {
    if (query.name === undefined) continue;
    const matches = query.relationFilters?.length
      ? checkQueryWithRelations(ctx, query, entity)
      : query.check(ctx, entity);
    if (matches) query.add(entity);
    else query.remove(ctx, entity);
  }

  for (const query of data.trackingQueries) {
    if (query.name === undefined) continue;
    // Recheck membership without recording an additional tracking event.
    const matches = query.relationFilters?.length
      ? checkQueryTrackingWithRelations(ctx, query, entity, 'change', -1, 0)
      : query.checkTracking(ctx, entity, 'change', -1, 0);
    if (matches) query.add(entity);
    else query.remove(ctx, entity);
  }
}
