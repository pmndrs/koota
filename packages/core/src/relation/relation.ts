import type { SparseSet } from '@koota/collections';
import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import type { QueryParameter } from '../query/types';
import { addEntityToQuery, removeEntityFromQuery } from '../query/query';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { isQuery } from '../query/utils/is-query';
import { Schema } from '../storage';
import { hasTrait, trait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import type { Relation, RelationPair } from './types';
import { $relation, $relationPair } from './symbols';

function ensureRelPage(arr: any[], pageId: number): any[] {
  if (!arr[pageId]) arr[pageId] = [];
  return arr[pageId];
}

function createRelation<S extends Schema = Record<string, never>>(definition?: {
  exclusive?: boolean;
  autoDestroy?: 'orphan' | 'source' | 'target';
  /** @deprecated Use `autoDestroy: 'orphan'` instead */
  autoRemoveTarget?: boolean;
  store?: S;
}): Relation<Trait<S>> {
  const relationTrait = trait(definition?.store ?? ({} as S)) as unknown as Trait<S>;
  const traitCtx = relationTrait[$internal];

  traitCtx.relation = null!;

  let autoDestroy: 'source' | 'target' | false = false;
  if (definition?.autoDestroy === 'orphan' || definition?.autoDestroy === 'source') {
    autoDestroy = 'source';
  } else if (definition?.autoDestroy === 'target') {
    autoDestroy = 'target';
  }

  if (definition?.autoRemoveTarget) {
    console.warn("Koota: 'autoRemoveTarget' is deprecated. Use 'autoDestroy: \"orphan\"' instead.");
    autoDestroy = 'source';
  }

  const relationCtx = {
    trait: relationTrait,
    exclusive: definition?.exclusive ?? false,
    autoDestroy,
  };

  function relationFn(...args: any[]): RelationPair<Trait<S>> {
    const firstArg = args[0];
    if (firstArg === undefined) throw Error('Relation target is undefined');

    if (firstArg === '*' || typeof firstArg === 'number') {
      return {
        [$relationPair]: true,
        relation: relationFn as unknown as Relation<Trait<S>>,
        target: firstArg,
        params: args[1],
      };
    }

    if (isQuery(firstArg)) {
      if (args.length > 1) throw Error('Query relations do not accept additional parameters.');
      return {
        [$relationPair]: true,
        relation: relationFn as unknown as Relation<Trait<S>>,
        targetQuery: firstArg,
      };
    }

    return {
      [$relationPair]: true,
      relation: relationFn as unknown as Relation<Trait<S>>,
      targetQuery: args as QueryParameter[],
    };
  }

  const relation = Object.assign(relationFn, {
    [$internal]: relationCtx,
  }) as Relation<Trait<S>>;

  Object.defineProperty(relation, $relation, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  traitCtx.relation = relation;

  return relation;
}

export const relation = createRelation;

const EMPTY_ENTITY_ARRAY: readonly Entity[] = Object.freeze([]) as readonly Entity[];

function addToRelationSources(traitData: TraitInstance, entity: Entity, target: Entity): void {
  const buckets = (traitData.relationSourcesByTarget ??= []);
  const bucket = (buckets[getEntityId(target)] ??= []);
  bucket.push(entity);
}

function removeFromRelationSources(traitData: TraitInstance, entity: Entity, target: Entity): void {
  const bucket = traitData.relationSourcesByTarget?.[getEntityId(target)];
  if (!bucket) {
    if (assertsEnabled) {
      throw new Error(
        `Koota: [RELATION_INDEX] A forward relation has no reverse source bucket. Entity ${entity}, target ${target}, trait ${traitData.trait.id}.`
      );
    }
    return;
  }
  const idx = bucket.indexOf(entity);
  if (idx === -1) {
    if (assertsEnabled) {
      throw new Error(
        `Koota: [RELATION_INDEX] A forward relation is missing its reverse source. Entity ${entity}, target ${target}, trait ${traitData.trait.id}.`
      );
    }
    return;
  }
  const last = bucket.length - 1;
  if (idx !== last) bucket[idx] = bucket[last];
  bucket.pop();
}

/**
 * Get the targets for a relation on an entity.
 * Returns an array of target entity IDs.
 */
export /* @inline */ function getRelationTargets(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity
): readonly Entity[] {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  const relationCtx = relation[$internal];

  const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  if (!traitData || !traitData.relationTargets) return [];

  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const page = traitData.relationTargets[p];
  if (!page) return [];

  if (relationCtx.exclusive) {
    const target = page[o] as Entity | undefined;
    return target !== undefined ? [target] : [];
  } else {
    const targets = page[o] as number[] | undefined;
    return targets !== undefined ? (targets.slice() as Entity[]) : [];
  }
}

export /* @inline */ function getFirstRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity
): Entity | undefined {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  const relationCtx = relation[$internal];

  const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  if (!traitData || !traitData.relationTargets) return undefined;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return undefined;

  if (relationCtx.exclusive) {
    return page[eid & 1023] as Entity | undefined;
  } else {
    return (page[eid & 1023] as number[] | undefined)?.[0] as Entity | undefined;
  }
}

export /* @inline @pure */ function getTargetIndex(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData || !traitData.relationTargets) return -1;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return -1;

  if (relationCtx.exclusive) {
    return page[eid & 1023] === target ? 0 : -1;
  } else {
    const targets = page[eid & 1023] as number[] | undefined;
    return targets ? targets.indexOf(target) : -1;
  }
}

export /* @inline @pure */ function hasRelationToTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): boolean {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData || !traitData.relationTargets) return false;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return false;

  if (relationCtx.exclusive) {
    return page[eid & 1023] === target;
  } else {
    const targets = page[eid & 1023] as number[] | undefined;
    return targets ? targets.includes(target) : false;
  }
}

export function addRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (assertsEnabled) assertRelationMembership(ctx, entity, traitData);
  if (!traitData) return -1;

  if (!traitData.relationTargets) {
    traitData.relationTargets = [];
  }

  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const page = ensureRelPage(traitData.relationTargets, p);

  let targetIndex: number;

  if (relationCtx.exclusive) {
    if (page[o] === target) return -1;
    if (assertsEnabled) ctx.structuralRevision++;
    page[o] = target;
    targetIndex = 0;
  } else {
    if (!page[o]) page[o] = [];
    const entityTargets = page[o] as number[];

    const existingIndex = entityTargets.indexOf(target);
    if (existingIndex !== -1) return -1;

    targetIndex = entityTargets.length;
    if (assertsEnabled) ctx.structuralRevision++;
    entityTargets.push(target);
  }

  traitData.version++;
  updateQueriesForRelationChange(ctx, relation, entity);
  addToRelationSources(traitData, entity, target);

  return targetIndex;
}

/** Returns how many targets remain on the entity, or -1 when the pair was not present. */
export function removeRelationTarget(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): number {
  const relationCtx = relation[$internal];
  const relationTrait = relationCtx.trait;

  const data = getTraitInstance(ctx.traitInstances, relationTrait);
  if (!data || !data.relationTargets) return -1;

  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const page = data.relationTargets[p];
  if (!page) return -1;

  let remaining = -1;

  if (relationCtx.exclusive) {
    if (page[o] === target) {
      if (assertsEnabled) ctx.structuralRevision++;
      removeFromRelationSources(data, entity, target);
      page[o] = undefined;
      remaining = 0;
      clearRelationDataInternal(data.store, relationTrait[$internal].type, eid, 0, true);
    }
  } else {
    const entityTargets = page[o] as number[] | undefined;
    if (entityTargets) {
      const idx = entityTargets.indexOf(target);
      if (idx !== -1) {
        if (assertsEnabled) ctx.structuralRevision++;
        const lastIdx = entityTargets.length - 1;
        removeFromRelationSources(data, entity, target);
        if (idx !== lastIdx) entityTargets[idx] = entityTargets[lastIdx];
        entityTargets.pop();
        swapAndPopRelationData(data.store, relationTrait[$internal].type, eid, idx, lastIdx);
        remaining = entityTargets.length;
      }
    }
  }

  if (remaining !== -1) {
    data.version++;
    updateQueriesForRelationChange(ctx, relation, entity);
  }

  return remaining;
}

/** Forward edges require base trait membership until their final removal. */
/* @inline */ function assertRelationMembership(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance | undefined
) {
  const eid = getEntityId(entity);
  if (
    data === undefined ||
    (ctx.entityMasks[data.generationId][eid >>> 10][eid & 1023] & data.bitflag) === 0
  ) {
    throw new Error(
      `Koota: [RELATION_INDEX] Relation targets require their base trait membership. Entity ${entity}, trait ${data?.trait.id}.`
    );
  }
}

function updateQueriesForRelationChange(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity
): void {
  const baseTrait = relation[$internal].trait;
  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData) return;

  const queries = traitData.relationQueries;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const match = checkQueryWithRelations(ctx, query, entity);
    if (match) {
      addEntityToQuery(query, entity);
    } else {
      removeEntityFromQuery(ctx, query, entity);
    }
  }
}

function swapAndPopRelationData(
  store: any,
  type: string,
  eid: number,
  idx: number,
  lastIdx: number
): void {
  const p = eid >>> 10,
    o = eid & 1023;
  if (type === 'aos') {
    const arr = store[p]?.[o];
    if (arr) {
      if (idx !== lastIdx) arr[idx] = arr[lastIdx];
      arr.pop();
    }
  } else {
    for (const key in store) {
      const arr = store[key][p]?.[o];
      if (arr) {
        if (idx !== lastIdx) arr[idx] = arr[lastIdx];
        arr.pop();
      }
    }
  }
}

function clearRelationDataInternal(
  store: any,
  type: string,
  eid: number,
  _idx: number,
  exclusive: boolean
): void {
  if (!exclusive) return;
  const p = eid >>> 10,
    o = eid & 1023;
  if (type === 'aos') {
    if (store[p]) store[p][o] = undefined;
  } else {
    for (const key in store) {
      if (store[key][p]) store[key][p][o] = undefined;
    }
  }
}

export function removeAllRelationTargets(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity
): void {
  const targets = getRelationTargets(ctx, relation, entity);
  for (const target of targets) {
    removeRelationTarget(ctx, relation, entity, target);
  }
}

/**
 * Get all entities that have a specific relation targeting a specific entity.
 * Returns a fresh snapshot so callers can safely iterate while relations mutate.
 */
export function getEntitiesWithRelationTo(
  ctx: WorldContext,
  relation: Relation<Trait>,
  target: Entity
): readonly Entity[] {
  const baseTrait = relation[$internal].trait;
  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData?.relationSourcesByTarget) return EMPTY_ENTITY_ARRAY;
  return traitData.relationSourcesByTarget[getEntityId(target)]?.slice() ?? EMPTY_ENTITY_ARRAY;
}

export function getFirstEntityWithRelationTo(
  ctx: WorldContext,
  relation: Relation<Trait>,
  target: Entity
): Entity | undefined {
  const traitData = getTraitInstance(ctx.traitInstances, relation[$internal].trait);
  return traitData?.relationSourcesByTarget?.[getEntityId(target)]?.[0];
}

export function hasRelationTargetInSet(
  ctx: WorldContext,
  relation: Relation<Trait>,
  entity: Entity,
  matches: SparseSet
): boolean {
  const relationCtx = relation[$internal];
  const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
  if (!traitData?.relationTargets) return false;

  const eid = getEntityId(entity);
  const page = traitData.relationTargets[eid >>> 10];
  if (!page) return false;

  if (relationCtx.exclusive) {
    const target = page[eid & 1023] as Entity | undefined;
    return target !== undefined && matches.has(target);
  }

  const targets = page[eid & 1023] as number[] | undefined;
  if (!targets) return false;

  for (let i = 0; i < targets.length; i++) {
    if (matches.has(targets[i]!)) return true;
  }

  return false;
}

export function setRelationDataAtIndex(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  targetIndex: number,
  value: Record<string, unknown>
): void {
  const relationCtx = relation[$internal];
  const baseTrait = relationCtx.trait;
  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData) return;
  traitData.version++;

  const store = traitData.store;
  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;

  if (baseTrait[$internal].type === 'aos') {
    const page = ensureRelPage(store as any[], p);
    if (relationCtx.exclusive) {
      page[o] = value;
    } else {
      (page[o] ??= [])[targetIndex] = value;
    }
    return;
  }

  const storeRec = store as Record<string, any[]>;
  const schema = traitData.schema as Record<string, unknown>;
  const exclusive = relationCtx.exclusive;
  for (const key in value) {
    writeRelationField(storeRec, schema, key, value[key], exclusive, p, o, targetIndex);
  }
}

/** Writes one field of a pair record. Tuples copy into the array the pair already holds. */
function writeRelationField(
  store: Record<string, any[]>,
  schema: Record<string, unknown>,
  key: string,
  field: unknown,
  exclusive: boolean,
  p: number,
  o: number,
  targetIndex: number
) {
  const kPage = ensureRelPage(store[key], p);
  const slots: unknown[] = exclusive ? kPage : (kPage[o] ??= []);
  const slot = exclusive ? o : targetIndex;
  if (!Array.isArray(schema[key])) {
    slots[slot] = field;
    return;
  }
  // Each pair keeps one array per tuple. Writes copy into it, so it never aliases the caller's array.
  const stored = slots[slot] as unknown[] | undefined;
  if (stored === undefined) slots[slot] = Array.from(field as ArrayLike<unknown>);
  else for (let i = 0; i < stored.length; i++) stored[i] = (field as ArrayLike<unknown>)[i];
}

/**
 * Fills a new pair's record from the schema defaults and the given params. SoA fields are
 * resolved one at a time so no defaults object is built. Tag relations store nothing.
 */
export function initRelationData(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  traitData: TraitInstance,
  targetIndex: number,
  params: Record<string, unknown> | undefined
): void {
  const type = traitData.trait[$internal].type;
  if (type === 'tag') return;
  if (type === 'aos') {
    // An AoS record is fresh per pair, so the params are laid over the factory result.
    const record = (traitData.schema as () => Record<string, unknown>)();
    setRelationDataAtIndex(
      ctx,
      entity,
      relation,
      targetIndex,
      params === undefined ? record : Object.assign(record, params)
    );
    return;
  }

  traitData.version++;
  const store = traitData.store as Record<string, any[]>;
  const schema = traitData.schema as Record<string, unknown>;
  const exclusive = relation[$internal].exclusive;
  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  for (const key in schema) {
    let field: unknown;
    if (params !== undefined && key in params) field = params[key];
    else if (typeof schema[key] === 'function') field = (schema[key] as () => unknown)();
    else field = schema[key];
    writeRelationField(store, schema, key, field, exclusive, p, o, targetIndex);
  }
}

export function setRelationData(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity,
  value: Record<string, unknown>
): void {
  const targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) return;
  setRelationDataAtIndex(ctx, entity, relation, targetIndex, value);
}

export function getRelationData(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity,
  out?: Record<string, unknown>
): unknown {
  const baseTrait = relation[$internal].trait;
  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData) return undefined;

  const targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) return undefined;

  const traitCtx = baseTrait[$internal];
  const store = traitData.store;
  const eid = getEntityId(entity);
  const p = eid >>> 10,
    o = eid & 1023;
  const relationCtx = relation[$internal];

  if (traitCtx.type === 'aos') {
    const page = (store as any[])[p];
    if (!page) return undefined;
    if (relationCtx.exclusive) {
      return page[o];
    } else {
      return page[o]?.[targetIndex];
    }
  } else {
    const result: Record<string, unknown> = out ?? {};
    const storeRecord = store as Record<string, any[]>;
    const schema = traitData.schema as Record<string, unknown>;
    for (const key in store) {
      const kPage = storeRecord[key][p];
      if (!kPage) continue;
      const field = relationCtx.exclusive
        ? kPage[o]
        : (kPage[o] as unknown[] | undefined)?.[targetIndex];
      if (!Array.isArray(schema[key])) {
        result[key] = field;
      } else if (out) {
        // With out, tuples are copied into the arrays it already holds.
        const into = out[key] as unknown[];
        for (let i = 0; i < into.length; i++) into[i] = (field as unknown[])[i];
      } else {
        result[key] = (field as unknown[]).slice();
      }
    }
    return result;
  }
}

/**
 * Check if an entity has a concrete relation pair (specific target or wildcard).
 * Does NOT handle targetQuery — that is resolved by the query layer or entity convenience methods.
 */
export function hasRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair): boolean {
  const relation = pair.relation;
  const target = pair.target;

  if (!hasTrait(ctx, entity, relation[$internal].trait)) return false;

  if (target === '*') return true;
  if (typeof target === 'number') return hasRelationToTarget(ctx, relation, entity, target);

  return false;
}
