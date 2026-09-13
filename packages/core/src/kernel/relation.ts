import { addTrait, removeTrait, removeTraitNow } from './trait';
import { entityAt, isAlive } from './entity';
import { Any, INDEX_MASK, pairTargetIndex, type TraitId, type Entity, type PairId } from './id';
import { findRelationPair, relationPairs } from './pairs';
import { getDefinition, pair, relationDefinition } from './registry';
import { readRecord } from './schema';
import { deleteStore, storeRow } from './store';
import { bumpVersion, type World } from './world';

/** Concrete targets the entity holds for a relation. */
export function getTargets(world: World, entity: Entity, relation: TraitId): Entity[] {
  const result: Entity[] = [];
  if (!isAlive(world, entity)) return result;
  const pairs = relationPairs(world, entity & INDEX_MASK, getDefinition(relation).relationIndex);
  for (let i = 0; i < pairs.length; i++) result.push(entityAt(world, pairTargetIndex(pairs[i])));
  return result;
}

export function getFirstTarget(world: World, entity: Entity, relation: TraitId): Entity | undefined {
  if (!isAlive(world, entity)) return undefined;
  const found = findRelationPair(world, entity & INDEX_MASK, getDefinition(relation).relationIndex);
  return found === 0 ? undefined : entityAt(world, pairTargetIndex(found));
}

/** Entities holding a pair of the relation to the target. `Wildcard` matches any relation. */
export function getSources(world: World, relation: TraitId, target: Entity): Entity[] {
  if (!isAlive(world, target)) return [];
  const relationIndex = getDefinition(relation).relationIndex;
  if (relationIndex === 0) {
    const stores = world.pairsByTarget.get(target & INDEX_MASK);
    if (!stores || stores.length === 0) return [];
    if (stores.length === 1) return stores[0].sources.slice();
    const result = new Set<Entity>();
    for (let i = 0; i < stores.length; i++) {
      const sources = stores[i].sources;
      for (let j = 0; j < sources.length; j++) result.add(sources[j]);
    }
    return [...result];
  }
  const store = world.stores.get(pair(relation, target));
  if (!store) return [];
  return (store.order ?? store.sources).slice();
}

/**
 * Reorders the sources of an ordered relation's target. `sources` must be the
 * target's current sources, each once, in the new order; anything else leaves
 * the order untouched and returns false. Observed queries on the pair see a
 * new version, since their result order changed.
 */
export function setSources(world: World, relation: TraitId, target: Entity, sources: readonly Entity[]): boolean {
  if (!isAlive(world, target)) return false;
  const definition = getDefinition(relation);
  if (definition.relationIndex < 0 || !definition.ordered) return false;
  const pairId = pair(relation, target);
  const store = world.stores.get(pairId);
  const order = store === undefined ? null : store.order;
  if (order === null) return sources.length === 0;
  if (sources.length !== order.length) return false;
  const seen = new Set<Entity>();
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (seen.has(source) || !isAlive(world, source) || storeRow(world, source & INDEX_MASK, pairId) < 0) return false;
    seen.add(source);
  }
  order.length = 0;
  for (let i = 0; i < sources.length; i++) order.push(sources[i]);
  bumpVersion(world, pairId);
  bumpVersion(world, pair(relation, Any));
  const dynamics = world.observedDynamic;
  for (let i = 0; i < dynamics.length; i++) {
    const query = dynamics[i];
    if (query.pairTerms.includes(pairId) || query.orPairSources.includes(pairId)) query.version++;
  }
  return true;
}

/** Validates the target handle before building the pair. */
export function addPair(world: World, entity: Entity, relation: TraitId, target: Entity, value?: unknown): boolean {
  if (!isAlive(world, target)) return false;
  return addTrait(world, entity, pair(relation, target), value);
}

export function removePair(world: World, entity: Entity, relation: TraitId, target: Entity): boolean {
  if (target !== Any && !isAlive(world, target)) return false;
  return removeTrait(world, entity, pair(relation, target));
}

export function targetOf(world: World, pairId: PairId): Entity {
  return entityAt(world, pairTargetIndex(pairId));
}

/**
 * Removes every pair targeting the entity at `targetIndex` from its sources.
 * A relation's `onTargetDestroy` hook runs per source first, while the target
 * is still readable; whatever pair the hook leaves in place is removed after
 * it returns. Sources of `autoDestroy: 'source'` relations queue for
 * destruction, and emptied stores are dropped.
 */
export function cleanupTarget(world: World, targetIndex: number, queue: Entity[], marks: Set<number>): void {
  const stores = world.pairsByTarget.get(targetIndex);
  if (!stores || stores.length === 0) return;
  const affected = stores.slice();
  for (let s = 0; s < affected.length; s++) {
    const store = affected[s];
    const definition = relationDefinition(store.type);
    const cascade = definition.autoDestroy === 1;
    const hook = definition.hooks !== null ? definition.hooks.onTargetDestroy : null;
    let guard = store.sources.length + 1;
    while (store.sources.length > 0 && guard-- > 0) {
      const row = store.sources.length - 1;
      const source = store.sources[row];
      const sourceIndex = source & INDEX_MASK;
      if (hook !== null) {
        hook(world, source, store.type, store.plan === null ? undefined : readRecord(store.columns!, store.plan, row));
        if (!isAlive(world, source) || storeRow(world, sourceIndex, store.type) < 0) continue;
      }
      if (cascade && !marks.has(sourceIndex)) {
        marks.add(sourceIndex);
        queue.push(source);
      }
      removeTraitNow(world, source, store.type);
    }
    if (store.sources.length === 0) deleteStore(world, store);
  }
}
