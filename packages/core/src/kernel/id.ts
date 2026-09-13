/**
 * Identity encoding.
 *
 * Entity: `generation << 21 | index`, index in [1, 2^21). World-local.
 * Trait: registry index, `1 <= id < 2^21`. Global.
 * Pair: `2^29 | relationIndex << 21 | targetIndex`. Computed, never interned.
 *
 * Every value stays below 2^30, so handles are Smis on every V8 build.
 */

export type Entity = number;
export type TraitId = number;
export type PairId = number;
/** A trait id or a pair id: anything an archetype can contain. */
export type TypeId = number;

export const INDEX_BITS = 21;
export const INDEX_MASK = 0x1fffff;
export const MAX_INDEX = INDEX_MASK;
export const GENERATION_MASK = 0xff;
export const MAX_GENERATION = 255;
export const ENTITY_MASK = 0x1fffffff;
export const PAIR_FLAG = 0x20000000;
export const RELATION_MASK = 0xff;
export const MAX_RELATIONS = 256;

/** Wildcard target for pairs. Index 0 is never an entity. */
export const Any = 0;

export function encodeEntity(generation: number, index: number): Entity {
  return (generation << INDEX_BITS) | index;
}

export function entityIndex(entity: Entity): number {
  return entity & INDEX_MASK;
}

export function entityGeneration(entity: Entity): number {
  return (entity >>> INDEX_BITS) & GENERATION_MASK;
}

export function isPair(id: TypeId): boolean {
  return id >= PAIR_FLAG;
}

export function encodePair(relationIndex: number, targetIndex: number): PairId {
  return PAIR_FLAG | (relationIndex << INDEX_BITS) | targetIndex;
}

export function pairRelationIndex(pair: PairId): number {
  return (pair >>> INDEX_BITS) & RELATION_MASK;
}

export function pairTargetIndex(pair: PairId): number {
  return pair & INDEX_MASK;
}

/** True for `pair(relation, Any)` and `pair(Wildcard, target)`. */
export function isWildcardPair(pair: PairId): boolean {
  return pairRelationIndex(pair) === 0 || (pair & INDEX_MASK) === Any;
}
