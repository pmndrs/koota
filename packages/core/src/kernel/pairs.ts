import { PAIR_FLAG, pairRelationIndex, pairTargetIndex, type PairId } from './id';
import type { World } from './world';

/**
 * Relation-side scans over an entity's external list. Concrete pairs share
 * the store mechanism with sparse traits; what is pair-specific is the
 * relation and target packed into the key, which these helpers read. Sparse
 * trait keys sit below `PAIR_FLAG` and are skipped.
 */

/** Whether the entity holds any concrete pair. */
export function hasAnyPair(world: World, index: number): boolean {
  const list = world.externals[index];
  if (list === undefined) return false;
  for (let i = 0; i < list.length; i += 2) if (list[i] >= PAIR_FLAG) return true;
  return false;
}

/** First concrete pair of the relation held by the entity, or 0. */
export function findRelationPair(world: World, index: number, relationIndex: number): PairId {
  const list = world.externals[index];
  if (list === undefined) return 0;
  for (let i = 0; i < list.length; i += 2) {
    if (list[i] >= PAIR_FLAG && pairRelationIndex(list[i]) === relationIndex) return list[i];
  }
  return 0;
}

export function countRelationPairs(world: World, index: number, relationIndex: number): number {
  const list = world.externals[index];
  if (list === undefined) return 0;
  let total = 0;
  for (let i = 0; i < list.length; i += 2) {
    if (list[i] >= PAIR_FLAG && pairRelationIndex(list[i]) === relationIndex) total++;
  }
  return total;
}

/** Every concrete pair of the relation held by the entity. */
export function relationPairs(world: World, index: number, relationIndex: number): PairId[] {
  const result: PairId[] = [];
  const list = world.externals[index];
  if (list === undefined) return result;
  for (let i = 0; i < list.length; i += 2) {
    if (list[i] >= PAIR_FLAG && pairRelationIndex(list[i]) === relationIndex) result.push(list[i]);
  }
  return result;
}

export function hasTargetPair(world: World, index: number, targetIndex: number): boolean {
  const list = world.externals[index];
  if (list === undefined) return false;
  for (let i = 0; i < list.length; i += 2) {
    if (list[i] >= PAIR_FLAG && pairTargetIndex(list[i]) === targetIndex) return true;
  }
  return false;
}
