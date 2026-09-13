import { addedStamp, changedStamp, type Archetype } from './archetype';
import { entityAt, isAlive } from './entity';
import { ensureFilter, filterMatches, type Filter } from './filter';
import {
  Any,
  encodePair,
  INDEX_MASK,
  isPair,
  pairRelationIndex,
  pairTargetIndex,
  type TraitId,
  type Entity,
  type TypeId,
} from './id';
import { hasAnyPair, hasTargetPair } from './pairs';
import { getDefinition, sparseFlags } from './registry';
import { storeRow, type Store } from './store';
import { advanceRevision, revision } from './revision';
import { archetypeAt, type World } from './world';

export const ADDED = 0;
export const CHANGED = 1;
export const REMOVED = 2;
export type TrackEvent = 0 | 1 | 2;

const MAX_BRANCHES = 32;

// ---------------------------------------------------------------------------
// Trackers and terms
// ---------------------------------------------------------------------------

/** A tracking baseline. Events before its creation are never reported. */
export type Tracker = { readonly id: number; readonly baseline: number };

let trackerCount = 0;

export function createTracker(): Tracker {
  const tracker = { id: trackerCount++, baseline: revision };
  advanceRevision();
  return tracker;
}

/** Removal history is only recorded once a tracker exists. */
export function hasTrackers(): boolean {
  return trackerCount > 0;
}

export type NotTerm = { readonly kind: 1; readonly id: TypeId };
export type TrackTerm = {
  readonly kind: 3;
  readonly event: TrackEvent;
  readonly id: TypeId;
  readonly tracker: Tracker;
};
export type OrTerm = { readonly kind: 2; readonly terms: readonly (TypeId | TrackTerm)[] };
/** Entities with a pair of `relation` to any target matching `terms`. */
export type TargetTerm = { readonly kind: 4; readonly relation: TraitId; readonly terms: readonly Term[] };
export type Term = TypeId | NotTerm | OrTerm | TrackTerm | TargetTerm;

export function not(id: TypeId): NotTerm {
  return { kind: 1, id };
}

export function or(...terms: (TypeId | TrackTerm)[]): OrTerm {
  if (terms.length === 0) throw new Error('Koota: or() requires at least one term.');
  return { kind: 2, terms };
}

export function added(id: TypeId, tracker: Tracker): TrackTerm {
  return { kind: 3, event: ADDED, id, tracker };
}

export function changed(id: TypeId, tracker: Tracker): TrackTerm {
  return { kind: 3, event: CHANGED, id, tracker };
}

export function removed(id: TypeId, tracker: Tracker): TrackTerm {
  return { kind: 3, event: REMOVED, id, tracker };
}

export function targets(relation: TraitId, ...terms: Term[]): TargetTerm {
  if (getDefinition(relation).relationIndex < 0) throw new Error('Koota: targets() requires a relation.');
  return { kind: 4, relation, terms };
}

// ---------------------------------------------------------------------------
// Compiled queries
// ---------------------------------------------------------------------------

type CompiledTarget = { relationIndex: number; query: Query; unsubscribe: (() => void) | null };

export type QuerySubscriber = (entity: Entity) => void;

export type Query = {
  readonly key: string;
  /** Static candidate archetypes, one filter per disjoint or-branch. */
  readonly branches: Filter[];
  /** Static terms without or-expansion, for membership checks. */
  readonly base: Filter;
  readonly tracking: TrackTerm[];
  readonly orGroups: (TypeId | TrackTerm)[][];
  readonly targets: CompiledTarget[];
  /** Required and forbidden concrete pairs, checked per entity. */
  readonly pairTerms: TypeId[];
  readonly pairExcludes: TypeId[];
  /** Required and forbidden sparse traits, checked per entity. */
  readonly sparseTerms: TypeId[];
  readonly sparseExcludes: TypeId[];
  /** Required and forbidden `pair(Wildcard, target)` terms, by target index. */
  readonly targetTerms: number[];
  readonly targetExcludes: number[];
  /** Candidate sources the archetype scan cannot reach: removal maps, pair stores, target stores. */
  readonly removedSources: TypeId[];
  readonly orPairSources: TypeId[];
  readonly orSparseSources: TypeId[];
  readonly orTargetSources: number[];
  /** Whether candidates come from the branch archetypes at all. */
  readonly scan: boolean;
  /** Whether a per-entity predicate runs. Static queries are pure archetype lists. */
  readonly dynamic: boolean;
  readonly hasTracking: boolean;
  /** Membership depends on storage outside archetypes: concrete pairs or sparse traits. */
  readonly externalSensitive: boolean;
  /** Tracking terms whose stamps live in archetypes, when every dynamic term is one. */
  readonly stampTerms: TrackTerm[] | null;
  /** Revision at which each entity was last reported, for tracking queries. */
  reported: Float64Array | null;
  /** Boundary at which each archetype was last fully scanned by a consuming read. */
  consumedAt: Float64Array | null;
  observed: boolean;
  version: number;
  /** Current members of an observed dynamic query. */
  members: Set<Entity> | null;
  readonly addSubscribers: Set<QuerySubscriber>;
  readonly removeSubscribers: Set<QuerySubscriber>;
};

function termKey(term: Term): string {
  if (typeof term === 'number') return String(term);
  switch (term.kind) {
    case 1:
      return `!${term.id}`;
    case 3:
      return `${'+~-'[term.event]}${term.id}:${term.tracker.id}`;
    case 2:
      return `|${term.terms.map(termKey).sort().join(',')}`;
    case 4:
      return `>${term.relation}(${term.terms.map(termKey).sort().join(';')})`;
  }
}

export function queryKey(terms: readonly Term[]): string {
  return terms.map(termKey).sort().join(';');
}

function sortUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

export function peekQuery(world: World, terms: readonly Term[]): Query | undefined {
  return world.queries.get(queryKey(terms));
}

export function resolveQuery(world: World, terms: readonly Term[]): Query {
  const key = queryKey(terms);
  let query = world.queries.get(key);
  if (!query) {
    query = compile(world, key, terms);
    world.queries.set(key, query);
  }
  return query;
}

/** 0 archetype type, 1 concrete pair, 2 any relation to a target, 3 any pair at all, 4 sparse trait. */
function classify(id: TypeId): 0 | 1 | 2 | 3 | 4 {
  if (!isPair(id)) return sparseFlags[id] === 1 ? 4 : 0;
  const relationIndex = pairRelationIndex(id);
  const targetIndex = pairTargetIndex(id);
  if (targetIndex === Any) return relationIndex === 0 ? 3 : 0;
  return relationIndex === 0 ? 2 : 1;
}

function expandBranches(world: World, include: TypeId[], exclude: TypeId[], groups: TypeId[][]): Filter[] {
  let branches = [{ include, exclude }];
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    if (group.some((id) => include.includes(id))) continue;
    const next: { include: TypeId[]; exclude: TypeId[] }[] = [];
    for (let b = 0; b < branches.length; b++) {
      for (let i = 0; i < group.length; i++) {
        next.push({
          include: branches[b].include.concat(group[i]),
          exclude: branches[b].exclude.concat(group.slice(0, i)),
        });
      }
    }
    branches = next;
    if (branches.length > MAX_BRANCHES) throw new Error('Koota: Query or() expansion limit exceeded.');
  }
  const filters: Filter[] = [];
  for (let b = 0; b < branches.length; b++) {
    const branchInclude = sortUnique(branches[b].include);
    const branchExclude = sortUnique(branches[b].exclude);
    if (branchInclude.some((id) => branchExclude.includes(id))) continue;
    filters.push(ensureFilter(world, branchInclude, branchExclude));
  }
  return filters;
}

function compile(world: World, key: string, terms: readonly Term[]): Query {
  const include: TypeId[] = [];
  const exclude: TypeId[] = world.exclude.slice();
  const tracking: TrackTerm[] = [];
  const orGroups: (TypeId | TrackTerm)[][] = [];
  const compiledTargets: CompiledTarget[] = [];
  const pairTerms: TypeId[] = [];
  const pairExcludes: TypeId[] = [];
  const sparseTerms: TypeId[] = [];
  const sparseExcludes: TypeId[] = [];
  const targetTerms: number[] = [];
  const targetExcludes: number[] = [];
  const removedSources: TypeId[] = [];
  const orPairSources: TypeId[] = [];
  const orSparseSources: TypeId[] = [];
  const orTargetSources: number[] = [];
  let orTracking = false;
  let anyPair = false;

  const require = (id: TypeId) => {
    switch (classify(id)) {
      case 0:
        include.push(id);
        break;
      case 1:
        pairTerms.push(id);
        break;
      case 2:
        targetTerms.push(pairTargetIndex(id));
        break;
      case 3:
        anyPair = true;
        break;
      case 4:
        sparseTerms.push(id);
        break;
    }
  };

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (typeof term === 'number') {
      require(term);
      continue;
    }
    switch (term.kind) {
      case 1:
        switch (classify(term.id)) {
          case 0:
            exclude.push(term.id);
            break;
          case 1:
            pairExcludes.push(term.id);
            break;
          case 2:
            targetExcludes.push(pairTargetIndex(term.id));
            break;
          case 3:
            throw new Error('Koota: not(pair(Wildcard, Any)) is not supported.');
          case 4:
            sparseExcludes.push(term.id);
            break;
        }
        break;
      case 3:
        tracking.push(term);
        if (term.event !== REMOVED) require(term.id);
        break;
      case 2: {
        const group = term.terms.slice();
        orGroups.push(group);
        for (let j = 0; j < group.length; j++) {
          const alternative = group[j];
          const id = typeof alternative === 'number' ? alternative : alternative.id;
          if (typeof alternative !== 'number') {
            orTracking = true;
            if (alternative.event === REMOVED) {
              removedSources.push(id);
              continue;
            }
          }
          switch (classify(id)) {
            case 1:
              orPairSources.push(id);
              break;
            case 2:
              orTargetSources.push(pairTargetIndex(id));
              break;
            case 3:
              throw new Error('Koota: or(pair(Wildcard, Any)) is not supported.');
            case 4:
              orSparseSources.push(id);
              break;
          }
        }
        break;
      }
      case 4: {
        const relationIndex = getDefinition(term.relation).relationIndex;
        compiledTargets.push({ relationIndex, query: resolveQuery(world, term.terms), unsubscribe: null });
        include.push(encodePair(relationIndex, Any));
        break;
      }
    }
  }

  // Alternatives that are archetype types expand into disjoint branches.
  const staticOr: TypeId[][] = [];
  for (let g = 0; g < orGroups.length; g++) {
    const alternatives: TypeId[] = [];
    const group = orGroups[g];
    for (let j = 0; j < group.length; j++) {
      const alternative = group[j];
      if (typeof alternative !== 'number' && alternative.event === REMOVED) continue;
      const id = typeof alternative === 'number' ? alternative : alternative.id;
      if (classify(id) === 0 && !alternatives.includes(id)) alternatives.push(id);
    }
    if (alternatives.length > 0) staticOr.push(alternatives.sort((a, b) => a - b));
  }

  let scan = true;
  if (pairTerms.length > 0 || sparseTerms.length > 0 || targetTerms.length > 0) {
    scan = false;
  } else if (include.length === 0 && staticOr.length === 0 && (tracking.length > 0 || orTracking)) {
    const onlyRemoved =
      tracking.every((term) => term.event === REMOVED) &&
      orGroups.every((group) => group.every((alt) => typeof alt !== 'number' && alt.event === REMOVED));
    if (onlyRemoved) {
      scan = false;
      for (let i = 0; i < tracking.length; i++) removedSources.push(tracking[i].id);
    }
  }

  const sortedInclude = sortUnique(include);
  const sortedExclude = sortUnique(exclude);
  const hasTracking = tracking.length > 0 || orTracking;
  const externalSensitive =
    pairTerms.length > 0 ||
    pairExcludes.length > 0 ||
    sparseTerms.length > 0 ||
    sparseExcludes.length > 0 ||
    orSparseSources.length > 0 ||
    targetTerms.length > 0 ||
    targetExcludes.length > 0 ||
    anyPair ||
    orPairSources.length > 0 ||
    orTargetSources.length > 0 ||
    compiledTargets.length > 0;

  // Untouched archetypes can be skipped only when every dynamic term reads archetype stamps.
  let stampTerms: TrackTerm[] | null = null;
  if (scan && hasTracking && !externalSensitive) {
    const collected: TrackTerm[] = [];
    let eligible = true;
    const consider = (term: TrackTerm) => {
      if (term.event === REMOVED || classify(term.id) !== 0) eligible = false;
      else collected.push(term);
    };
    for (let i = 0; i < tracking.length; i++) consider(tracking[i]);
    for (let g = 0; g < orGroups.length && eligible; g++) {
      for (const alternative of orGroups[g]) if (typeof alternative !== 'number') consider(alternative);
    }
    if (eligible) stampTerms = collected;
  }

  const query: Query = {
    key,
    branches: expandBranches(world, sortedInclude, sortedExclude, staticOr),
    base: ensureFilter(world, sortedInclude, sortedExclude),
    tracking,
    orGroups,
    targets: compiledTargets,
    pairTerms: sortUnique(pairTerms),
    pairExcludes: sortUnique(pairExcludes),
    sparseTerms: sortUnique(sparseTerms),
    sparseExcludes: sortUnique(sparseExcludes),
    targetTerms: sortUnique(targetTerms),
    targetExcludes: sortUnique(targetExcludes),
    removedSources: sortUnique(removedSources),
    orPairSources: sortUnique(orPairSources),
    orSparseSources: sortUnique(orSparseSources),
    orTargetSources: sortUnique(orTargetSources),
    scan,
    dynamic: hasTracking || externalSensitive,
    hasTracking,
    externalSensitive,
    stampTerms,
    reported: null,
    consumedAt: null,
    observed: false,
    version: 0,
    members: null,
    addSubscribers: new Set(),
    removeSubscribers: new Set(),
  };

  const trackedTypes = new Set<TypeId>();
  for (let i = 0; i < tracking.length; i++) trackedTypes.add(tracking[i].id);
  for (let g = 0; g < orGroups.length; g++) {
    for (const alternative of orGroups[g]) if (typeof alternative !== 'number') trackedTypes.add(alternative.id);
  }
  for (const type of trackedTypes) {
    let queries = world.trackingByType.get(type);
    if (!queries) world.trackingByType.set(type, (queries = []));
    queries.push(query);
  }
  return query;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function eventStamp(world: World, term: TrackTerm, entity: Entity, archetype: Archetype, row: number): number {
  const type = term.id;
  if (term.event === REMOVED) return world.removed.get(type)?.get(entity) ?? 0;
  const kind = classify(type);
  if (kind === 1 || kind === 4) {
    const store = world.stores.get(type);
    if (!store) return 0;
    const row = storeRow(world, entity & INDEX_MASK, type);
    if (row < 0) return 0;
    return term.event === ADDED ? store.added[row] : store.changed[row];
  }
  return term.event === ADDED ? addedStamp(archetype, type, row) : changedStamp(archetype, type, row);
}

function satisfied(
  world: World,
  term: TrackTerm,
  entity: Entity,
  archetype: Archetype,
  row: number,
  reported: number
): boolean {
  const baseline = term.tracker.baseline;
  return eventStamp(world, term, entity, archetype, row) > (reported > baseline ? reported : baseline);
}

function present(world: World, index: number, archetype: Archetype, id: TypeId): boolean {
  switch (classify(id)) {
    case 0:
      return archetype.records.has(id);
    case 1:
      return storeRow(world, index, id) >= 0;
    case 2:
      return hasTargetPair(world, index, pairTargetIndex(id));
    case 3:
      return hasAnyPair(world, index);
    case 4:
      return storeRow(world, index, id) >= 0;
  }
}

function reportedAt(query: Query, entity: Entity): number {
  const reported = query.reported;
  if (!reported) return 0;
  const index = entity & INDEX_MASK;
  return index < reported.length ? reported[index] : 0;
}

/** The per-entity predicate: pairs, tracking terms, or-groups, and relation targets. */
function matches(world: World, query: Query, entity: Entity, archetype: Archetype, row: number): boolean {
  const index = entity & INDEX_MASK;
  const pairTerms = query.pairTerms;
  for (let i = 0; i < pairTerms.length; i++) if (storeRow(world, index, pairTerms[i]) < 0) return false;
  const pairExcludes = query.pairExcludes;
  for (let i = 0; i < pairExcludes.length; i++) if (storeRow(world, index, pairExcludes[i]) >= 0) return false;
  const sparseTerms = query.sparseTerms;
  for (let i = 0; i < sparseTerms.length; i++) if (storeRow(world, index, sparseTerms[i]) < 0) return false;
  const sparseExcludes = query.sparseExcludes;
  for (let i = 0; i < sparseExcludes.length; i++) if (storeRow(world, index, sparseExcludes[i]) >= 0) return false;
  const targetTerms = query.targetTerms;
  for (let i = 0; i < targetTerms.length; i++) if (!hasTargetPair(world, index, targetTerms[i])) return false;
  const targetExcludes = query.targetExcludes;
  for (let i = 0; i < targetExcludes.length; i++) if (hasTargetPair(world, index, targetExcludes[i])) return false;

  const reported = reportedAt(query, entity);
  const tracking = query.tracking;
  for (let i = 0; i < tracking.length; i++) {
    if (!satisfied(world, tracking[i], entity, archetype, row, reported)) return false;
  }
  const groups = query.orGroups;
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    let any = false;
    for (let i = 0; i < group.length && !any; i++) {
      const alternative = group[i];
      any =
        typeof alternative === 'number'
          ? present(world, index, archetype, alternative)
          : satisfied(world, alternative, entity, archetype, row, reported);
    }
    if (!any) return false;
  }
  const compiledTargets = query.targets;
  for (let i = 0; i < compiledTargets.length; i++) {
    if (!hasMatchingTarget(world, compiledTargets[i], index)) return false;
  }
  return true;
}

function hasMatchingTarget(world: World, target: CompiledTarget, index: number): boolean {
  const list = world.externals[index];
  if (list === undefined) return false;
  for (let i = 0; i < list.length; i += 2) {
    const pair = list[i];
    if (!isPair(pair) || pairRelationIndex(pair) !== target.relationIndex) continue;
    if (entityInQuery(world, target.query, entityAt(world, pairTargetIndex(pair)))) return true;
  }
  return false;
}

function branchMatches(query: Query, archetype: Archetype): boolean {
  const branches = query.branches;
  for (let i = 0; i < branches.length; i++) if (filterMatches(branches[i], archetype)) return true;
  return false;
}

/** Whether a live entity currently matches the query, without consuming anything. */
export function entityInQuery(world: World, query: Query, entity: Entity): boolean {
  if (!isAlive(world, entity)) return false;
  const index = entity & INDEX_MASK;
  const archetype = archetypeAt(world, index);
  if (!query.dynamic) return branchMatches(query, archetype);
  if (!filterMatches(query.base, archetype)) return false;
  return matches(world, query, entity, archetype, world.rowOf[index]);
}

function ensureReported(world: World, query: Query): Float64Array {
  const required = world.generations.length;
  if (!query.reported || query.reported.length < required) {
    const next = new Float64Array(required);
    if (query.reported) next.set(query.reported);
    query.reported = next;
  }
  return query.reported;
}

function ensureConsumed(world: World, query: Query): Float64Array {
  const required = world.archetypes.length;
  if (!query.consumedAt || query.consumedAt.length < required) {
    const next = new Float64Array(Math.max(16, required * 2));
    if (query.consumedAt) next.set(query.consumedAt);
    query.consumedAt = next;
  }
  return query.consumedAt;
}

/** True when no stamp term can have advanced past `mark` in this archetype. */
function untouched(query: Query, archetype: Archetype, mark: number): boolean {
  const terms = query.stampTerms!;
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const record = archetype.records.get(term.id);
    if (record === undefined) continue;
    const slot = record.slot;
    const bound = term.event === ADDED ? archetype.maxAdded[slot] : archetype.maxChanged[slot];
    const floor = term.tracker.baseline > mark ? term.tracker.baseline : mark;
    if (bound > floor) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

function collectStatic(query: Query): Entity[] {
  const branches = query.branches;
  let total = 0;
  let single: Archetype | null = null;
  let count = 0;
  for (let b = 0; b < branches.length; b++) {
    const archetypes = branches[b].archetypes;
    for (let a = 0; a < archetypes.length; a++) {
      const length = archetypes[a].entities.length;
      if (length === 0) continue;
      total += length;
      single = archetypes[a];
      count++;
    }
  }
  if (count === 1) return single!.entities.slice();
  // oxlint-disable-next-line unicorn/no-new-array -- Preallocates the exact snapshot length.
  const out: Entity[] = new Array(total);
  let cursor = 0;
  for (let b = 0; b < branches.length; b++) {
    const archetypes = branches[b].archetypes;
    for (let a = 0; a < archetypes.length; a++) {
      const entities = archetypes[a].entities;
      for (let i = 0; i < entities.length; i++) out[cursor++] = entities[i];
    }
  }
  return out;
}

/** The smallest store among the required pairs and sparse traits, or undefined when one has no holders yet. */
function smallestStore(world: World, query: Query): Store | undefined {
  let smallest: Store | undefined;
  const pairs = query.pairTerms;
  for (let i = 0; i < pairs.length; i++) {
    const store = world.stores.get(pairs[i]);
    if (!store) return undefined;
    if (!smallest || store.sources.length < smallest.sources.length) smallest = store;
  }
  const sparse = query.sparseTerms;
  for (let i = 0; i < sparse.length; i++) {
    const store = world.stores.get(sparse[i]);
    if (!store) return undefined;
    if (!smallest || store.sources.length < smallest.sources.length) smallest = store;
  }
  return smallest;
}

function branchRows(query: Query): number {
  let total = 0;
  const branches = query.branches;
  for (let b = 0; b < branches.length; b++) {
    const archetypes = branches[b].archetypes;
    for (let a = 0; a < archetypes.length; a++) total += archetypes[a].entities.length;
  }
  return total;
}

/**
 * Snapshots the matching entities. Tracking queries consume the reported
 * entities unless `consume` is false: a later read only reports them again
 * after a newer event.
 */
export function collect(world: World, query: Query, consume = true): Entity[] {
  if (!query.dynamic) return collectStatic(query);
  const out: Entity[] = [];
  const reported = query.hasTracking ? ensureReported(world, query) : null;
  const stamp = consume && reported !== null;
  const boundary = revision;
  let consumed = false;
  let marked = false;
  const seen: Set<Entity> | null =
    !stamp &&
    (query.removedSources.length > 0 ||
      query.orPairSources.length > 0 ||
      query.orSparseSources.length > 0 ||
      query.orTargetSources.length > 0 ||
      query.pairTerms.length + query.sparseTerms.length > 1 ||
      query.targetTerms.length > 0)
      ? new Set()
      : null;

  const admit = (entity: Entity, archetype: Archetype, row: number): void => {
    if (seen !== null) {
      if (seen.has(entity)) return;
      seen.add(entity);
    }
    if (!matches(world, query, entity, archetype, row)) return;
    out.push(entity);
    if (stamp) {
      reported![entity & INDEX_MASK] = boundary;
      query.members?.delete(entity);
      consumed = true;
    }
  };
  // Store holders and recorded removals reach here alive: destruction empties an entity's stores first.
  const admitCandidate = (entity: Entity): void => {
    const index = entity & INDEX_MASK;
    const archetype = archetypeAt(world, index);
    if (!filterMatches(query.base, archetype)) return;
    admit(entity, archetype, world.rowOf[index]);
  };

  if (query.scan) {
    const consumedAt = query.stampTerms !== null ? ensureConsumed(world, query) : null;
    const branches = query.branches;
    for (let b = 0; b < branches.length; b++) {
      const archetypes = branches[b].archetypes;
      for (let a = 0; a < archetypes.length; a++) {
        const archetype = archetypes[a];
        const entities = archetype.entities;
        if (entities.length === 0) continue;
        if (consumedAt !== null && untouched(query, archetype, consumedAt[archetype.id])) continue;
        for (let row = 0; row < entities.length; row++) admit(entities[row], archetype, row);
        if (consumedAt !== null && stamp) {
          consumedAt[archetype.id] = boundary;
          marked = true;
        }
      }
    }
  } else if (query.pairTerms.length > 0 || query.sparseTerms.length > 0) {
    const store = smallestStore(world, query);
    if (store !== undefined) {
      if (store.sources.length <= branchRows(query)) {
        const sources = store.order ?? store.sources;
        for (let i = 0; i < sources.length; i++) admitCandidate(sources[i]);
      } else {
        // The store holds most candidates, so the matched archetype rows are the shorter walk.
        const branches = query.branches;
        for (let b = 0; b < branches.length; b++) {
          const archetypes = branches[b].archetypes;
          for (let a = 0; a < archetypes.length; a++) {
            const archetype = archetypes[a];
            const entities = archetype.entities;
            for (let row = 0; row < entities.length; row++) admit(entities[row], archetype, row);
          }
        }
      }
    }
  } else if (query.targetTerms.length > 0) {
    const stores = world.pairsByTarget.get(query.targetTerms[0]);
    if (stores) {
      for (let s = 0; s < stores.length; s++) {
        const sources = stores[s].order ?? stores[s].sources;
        for (let i = 0; i < sources.length; i++) admitCandidate(sources[i]);
      }
    }
  }

  const removedSources = query.removedSources;
  for (let s = 0; s < removedSources.length; s++) {
    const map = world.removed.get(removedSources[s]);
    if (!map) continue;
    for (const entity of map.keys()) {
      if (!isAlive(world, entity)) {
        map.delete(entity);
        continue;
      }
      admitCandidate(entity);
    }
  }
  const orPairSources = query.orPairSources;
  for (let s = 0; s < orPairSources.length; s++) {
    const store = world.stores.get(orPairSources[s]);
    if (!store) continue;
    const sources = store.order ?? store.sources;
    for (let i = 0; i < sources.length; i++) admitCandidate(sources[i]);
  }
  const orSparseSources = query.orSparseSources;
  for (let s = 0; s < orSparseSources.length; s++) {
    const store = world.stores.get(orSparseSources[s]);
    if (!store) continue;
    const sources = store.sources;
    for (let i = 0; i < sources.length; i++) admitCandidate(sources[i]);
  }
  const orTargetSources = query.orTargetSources;
  for (let s = 0; s < orTargetSources.length; s++) {
    const stores = world.pairsByTarget.get(orTargetSources[s]);
    if (!stores) continue;
    for (let t = 0; t < stores.length; t++) {
      const sources = stores[t].order ?? stores[t].sources;
      for (let i = 0; i < sources.length; i++) admitCandidate(sources[i]);
    }
  }
  // A recorded boundary must sit below every later stamp, even when nothing was reported.
  if (consumed || marked) advanceRevision();
  return out;
}

/** First matching entity without consuming, or undefined. */
export function first(world: World, query: Query): Entity | undefined {
  const branches = query.branches;
  if (!query.dynamic) {
    for (let b = 0; b < branches.length; b++) {
      const archetypes = branches[b].archetypes;
      for (let a = 0; a < archetypes.length; a++) {
        if (archetypes[a].entities.length > 0) return archetypes[a].entities[0];
      }
    }
    return undefined;
  }
  const result = collect(world, query, false);
  return result.length > 0 ? result[0] : undefined;
}

export function count(world: World, query: Query): number {
  const branches = query.branches;
  if (!query.dynamic) {
    let total = 0;
    for (let b = 0; b < branches.length; b++) {
      const archetypes = branches[b].archetypes;
      for (let a = 0; a < archetypes.length; a++) total += archetypes[a].entities.length;
    }
    return total;
  }
  return collect(world, query, false).length;
}

/**
 * Visits the non-empty archetypes of a static query with live storage. Return
 * false from the callback to stop. Structural mutation during the visit is
 * unsupported: snapshot with `collect` first.
 */
export function visitArchetypes(world: World, query: Query, callback: (archetype: Archetype) => unknown): void {
  if (query.dynamic) throw new Error('Koota: Only static queries expose archetypes.');
  const branches = query.branches;
  for (let b = 0; b < branches.length; b++) {
    const archetypes = branches[b].archetypes;
    for (let a = 0; a < archetypes.length; a++) {
      if (archetypes[a].entities.length === 0) continue;
      if (callback(archetypes[a]) === false) return;
    }
  }
}

// ---------------------------------------------------------------------------
// Observation: versions and subscriptions
// ---------------------------------------------------------------------------

function notify(subscribers: Set<QuerySubscriber>, entity: Entity): void {
  if (subscribers.size === 0) return;
  for (const subscriber of subscribers) subscriber(entity);
}

function updateMembership(world: World, query: Query, entity: Entity): void {
  const members = query.members!;
  const inQuery = entityInQuery(world, query, entity);
  if (inQuery) {
    if (members.has(entity)) return;
    members.add(entity);
    query.version++;
    notify(query.addSubscribers, entity);
  } else if (members.delete(entity)) {
    query.version++;
    notify(query.removeSubscribers, entity);
  }
}

function refreshSources(world: World, query: Query, relationIndex: number, target: Entity): void {
  const store = world.stores.get(encodePair(relationIndex, target & INDEX_MASK));
  if (!store) return;
  const sources = store.sources.slice();
  for (let i = 0; i < sources.length; i++) updateMembership(world, query, sources[i]);
}

/** Starts maintaining version and membership events for the query. */
export function observeQuery(world: World, query: Query): void {
  if (query.observed) return;
  query.observed = true;
  if (query.dynamic) {
    world.observedDynamic.push(query);
    query.members = new Set(collect(world, query, false));
  } else {
    world.observedStatic.push(query);
    world.observedEpoch++;
  }
  const compiledTargets = query.targets;
  for (let i = 0; i < compiledTargets.length; i++) {
    const target = compiledTargets[i];
    observeQuery(world, target.query);
    const refresh = (entity: Entity) => refreshSources(world, query, target.relationIndex, entity);
    target.query.addSubscribers.add(refresh);
    target.query.removeSubscribers.add(refresh);
    target.unsubscribe = () => {
      target.query.addSubscribers.delete(refresh);
      target.query.removeSubscribers.delete(refresh);
    };
  }
}

export function getQueryVersion(world: World, query: Query): number {
  observeQuery(world, query);
  return query.version;
}

export function subscribeQuery(
  world: World,
  query: Query,
  event: 'add' | 'remove',
  callback: QuerySubscriber
): () => void {
  observeQuery(world, query);
  const subscribers = event === 'add' ? query.addSubscribers : query.removeSubscribers;
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Membership bits of the observed static queries for an archetype, recomputed when the list changes. */
function observedMaskOf(world: World, archetype: Archetype): Uint32Array {
  const statics = world.observedStatic;
  const words = (statics.length + 31) >>> 5;
  let mask = archetype.observedMask;
  if (mask !== null && archetype.observedEpoch === world.observedEpoch) return mask;
  if (mask === null || mask.length < words) mask = new Uint32Array(Math.max(1, words));
  else mask.fill(0);
  for (let i = 0; i < statics.length; i++) {
    if (branchMatches(statics[i], archetype)) mask[i >>> 5] |= 1 << (i & 31);
  }
  archetype.observedMask = mask;
  archetype.observedEpoch = world.observedEpoch;
  return mask;
}

/** Called after an entity moved between archetypes, or was created (`from` null) or destroyed (`to` null). */
export function notifyTransition(world: World, entity: Entity, from: Archetype | null, to: Archetype | null): void {
  const statics = world.observedStatic;
  if (statics.length > 0) {
    const fromMask = from === null ? null : observedMaskOf(world, from);
    const toMask = to === null ? null : observedMaskOf(world, to);
    const words = (statics.length + 31) >>> 5;
    for (let w = 0; w < words; w++) {
      const before = fromMask === null ? 0 : fromMask[w];
      const after = toMask === null ? 0 : toMask[w];
      let diff = before ^ after;
      while (diff !== 0) {
        const bit = diff & -diff;
        diff ^= bit;
        const query = statics[(w << 5) + (31 - Math.clz32(bit))];
        query.version++;
        notify((after & bit) !== 0 ? query.addSubscribers : query.removeSubscribers, entity);
      }
    }
  }
  const dynamics = world.observedDynamic;
  for (let i = 0; i < dynamics.length; i++) {
    const query = dynamics[i];
    const members = query.members!;
    if (to === null) {
      if (members.delete(entity)) {
        query.version++;
        notify(query.removeSubscribers, entity);
      }
      continue;
    }
    if (query.hasTracking && !query.externalSensitive) {
      // Tracking membership changes through events; a move only invalidates.
      if (members.has(entity) && !filterMatches(query.base, to)) {
        members.delete(entity);
        query.version++;
        notify(query.removeSubscribers, entity);
      }
      continue;
    }
    updateMembership(world, query, entity);
  }
}

/** Called after an entity's concrete pairs or sparse traits changed without an archetype move. */
export function notifyExternal(world: World, entity: Entity): void {
  const dynamics = world.observedDynamic;
  for (let i = 0; i < dynamics.length; i++) {
    const query = dynamics[i];
    if (query.externalSensitive) updateMembership(world, query, entity);
  }
}

/** Called after a tracking event was stamped for `type` on `entity`. */
export function notifyEvent(world: World, type: TypeId, entity: Entity, _event: TrackEvent): void {
  const queries = world.trackingByType.get(type);
  if (!queries) return;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (query.observed) updateMembership(world, query, entity);
  }
}
