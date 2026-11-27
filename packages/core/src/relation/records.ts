import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { isRequired } from '../storage/schema';
import type { Schema } from '../storage/types';
import { getTraitInstance } from '../trait/registry';
import type { Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { ensureRelationPage, getTargetIndex } from './targets';
import type { Relation } from './types';

export function removePairRecordAt(
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

/** An exclusive pair owns a slot. A source with many targets reuses its list after eviction. */
export function clearPairRecords(instance: TraitInstance, eid: number, exclusive: boolean) {
  const type = instance.trait[$internal].type;
  if (type === 'tag') return;
  const store = instance.store as any;
  const p = eid >>> 10,
    o = eid & 1023;
  if (type === 'aos') clearRecordSlot(store[p], o, exclusive);
  else for (const key in store) clearRecordSlot(store[key][p], o, exclusive);
}

function clearRecordSlot(page: any[] | undefined, offset: number, exclusive: boolean) {
  if (page === undefined) return;
  if (exclusive) page[offset] = undefined;
  else {
    const records = page[offset];
    if (records !== undefined) while (records.length !== 0) records.pop();
  }
}

export function setPairRecordAt(
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
    const page = ensureRelationPage(store as any[], p);
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
    writePairField(storeRec, schema, key, value[key], exclusive, p, o, targetIndex);
  }
}

/** Writes one field of a pair record. Tuples copy into the array the pair already holds. */
function writePairField(
  store: Record<string, any[]>,
  schema: Record<string, unknown>,
  key: string,
  field: unknown,
  exclusive: boolean,
  p: number,
  o: number,
  targetIndex: number
) {
  const kPage = ensureRelationPage(store[key], p);
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
 * Asserts that params carry every value the store requires by calling the marker of a missing
 * one. Runs before the pair is granted, so a failed add leaves the entity without the pair.
 */
export function assertPairRecordParams(
  schema: Schema,
  params: Record<string, unknown> | undefined
): void {
  // A required store is the marker itself.
  if (typeof schema === 'function') {
    if (params === undefined) schema();
    return;
  }
  const fields = schema as Record<string, unknown>;
  for (const key in fields) {
    if (isRequired(fields[key]) && (params === undefined || !(key in params))) {
      (fields[key] as () => void)();
    }
  }
}

/**
 * Fills a new pair's record from the schema defaults and the given params. SoA fields are
 * resolved one at a time so no defaults object is built. Tag relations store nothing.
 */
export function initPairRecord(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  traitData: TraitInstance,
  targetIndex: number,
  params: Record<string, unknown> | undefined
): void {
  const traitCtx = traitData.trait[$internal];
  const type = traitCtx.type;
  if (type === 'tag') return;
  if (type === 'aos') {
    // An AoS record is fresh per pair, so the params are laid over the factory result.
    // A required store has no factory result, so the params are the record.
    let record = params;
    if (!traitCtx.required) {
      record = (traitData.schema as () => Record<string, unknown>)();
      if (params !== undefined) Object.assign(record, params);
    }
    setPairRecordAt(ctx, entity, relation, targetIndex, record!);
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
    writePairField(store, schema, key, field, exclusive, p, o, targetIndex);
  }
}

export function setPairRecord(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity,
  value: Record<string, unknown>
): void {
  const targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) return;
  setPairRecordAt(ctx, entity, relation, targetIndex, value);
}

export function getPairRecord(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<Trait>,
  target: Entity,
  out?: Record<string, unknown>
): unknown {
  const baseTrait = relation[$internal].trait;
  const traitCtx = baseTrait[$internal];
  // A relation without a store is a tag underneath, so its pairs have no record.
  if (traitCtx.type === 'tag') return undefined;

  const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
  if (!traitData) return undefined;

  const targetIndex = getTargetIndex(ctx, relation, entity, target);
  if (targetIndex === -1) return undefined;

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
    for (const key in storeRecord) {
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
