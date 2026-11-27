import { SparseSet } from '@koota/collections';
import { createPageTable } from '../entity/page-table';
import { isIdentifier, isIdentifierPair } from '../identifier/identifier';
import { $internal } from '../internal';
import { isRelationPair } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { ensureTraitInstance, getTraitInstance } from '../trait/registry';
import { trait } from '../trait/trait';
import type { TagTrait, Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import { getTrackingType, isTrackingModifier } from './modifiers';
import { createQuery, isModifier, isQuery } from './query';
import { EMPTY_TRACKER_PAGE } from './tracking';
import type {
  EventType,
  Modifier,
  QueryInstance,
  ResolvedRelationFilter,
  TrackingGroup,
} from './types';

export const IsExcluded: TagTrait = trait();

function resolveRelationFilter(
  pair: RelationPair,
  term: ResolvedRelationFilter['term']
): ResolvedRelationFilter {
  const targetQuery = pair.targetQuery;
  if (!targetQuery) {
    return { ...pair, term, resolvedTargetQuery: undefined, targetQueryMatches: undefined };
  }

  return {
    ...pair,
    term,
    resolvedTargetQuery: isQuery(targetQuery) ? targetQuery : createQuery(...targetQuery),
    targetQueryMatches: new SparseSet(),
  };
}

/** Adds a pair from a modifier as a relation filter. Its relation only needs to be registered. */
function addPairFilter(
  ctx: WorldContext,
  query: QueryInstance,
  pair: RelationPair,
  term: 2 | 3 | 4 | 5
): ResolvedRelationFilter {
  ensureTraitInstance(ctx, (pair.relation as Relation<Trait>)[$internal].trait);
  const filter = resolveRelationFilter(pair, term);
  ensureQueryFilters(query).pairs.push(filter);
  return filter;
}

/** The group for a tracking modifier's traits or for its pairs, created on first use. */
function ensureTrackingGroup(
  groups: TrackingGroup[],
  logic: 'and' | 'or',
  type: EventType,
  id: number,
  tracksPairs: boolean
): TrackingGroup {
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (
      group.type === type &&
      group.id === id &&
      group.logic === logic &&
      (group.pairs !== null) === tracksPairs
    ) {
      return group;
    }
  }
  const group: TrackingGroup = {
    logic,
    type,
    id,
    bitmasks: [],
    trackers: [],
    single: false,
    pairs: tracksPairs ? [] : null,
  };
  groups.push(group);
  return group;
}

function addTrackingModifier(
  ctx: WorldContext,
  query: QueryInstance,
  modifier: Modifier,
  logic: 'and' | 'or',
  groups: TrackingGroup[]
): void {
  const trackingType = getTrackingType(modifier);
  if (!trackingType) return;

  const id = modifier.id;
  const pairs = modifier.pairs;

  if (pairs === null || modifier.traits.length !== 0) {
    const group = ensureTrackingGroup(groups, logic, trackingType, id, false);
    for (const trait of modifier.traits) {
      const instance = ensureTraitInstance(ctx, trait);
      query.traits.push(trait);
      query.traitInstances.push(instance);

      const genId = instance.generationId;
      group.bitmasks[genId] = (group.bitmasks[genId] || 0) | instance.bitflag;
      group.trackers[genId] ??= createPageTable(ctx.pageLimit, EMPTY_TRACKER_PAGE);

      if (trackingType === 'change') {
        query.changedMasks[genId] = (query.changedMasks[genId] || 0) | instance.bitflag;
        ctx.trackingRevision++;
      }
    }

    let tracked = 0;
    for (const mask of group.bitmasks) {
      for (let bits = mask ?? 0; bits !== 0; bits &= bits - 1) tracked++;
    }
    group.single = tracked === 1;
  }

  if (pairs !== null) {
    const group = ensureTrackingGroup(groups, logic, trackingType, id, true);
    const tracked = group.pairs!;
    for (let i = 0; i < pairs.length; i++) {
      if (tracked.length === 32) {
        throw new Error(
          'Koota: [TRACKED_PAIRS] A tracking modifier tracks at most 32 relation pairs.'
        );
      }
      // A tracked pair matches on its events. It joins the relation filters for their list
      // membership and target query, and the relation's tracking list so a pair write reaches it.
      const filter = addPairFilter(ctx, query, pairs[i], 4);
      query.traitInstances.push(
        getTraitInstance(ctx.traitInstances, filter.relation[$internal].trait)!
      );
      group.bitmasks[0] = (group.bitmasks[0] || 0) | (1 << tracked.length);
      group.trackers[0] ??= createPageTable(ctx.pageLimit, EMPTY_TRACKER_PAGE);
      tracked.push(filter);
    }
  }

  if (trackingType === 'remove') query.retains = true;
  query.isTracking = true;
}

/** Folds a trait's bit into the query's flat mask table under the given term. */
function addMaskBits(masks: number[], genId: number, bits: number, term: 1 | 2 | 3) {
  let i = 0;
  while (i < masks.length && masks[i] !== genId) i += 4;
  if (i === masks.length) masks.push(genId, 0, 0, 0);
  masks[i + term] |= bits;
}

/** Allocate pair and or filters only when the static mask table cannot express them. */
function ensureQueryFilters(query: QueryInstance) {
  return (query.filters ??= { pairs: [], orMasks: null, not: [], tracking: null });
}

/** A static or term can be satisfied by a held bit, a pair or a negated branch. */
function ensureOrFilters(query: QueryInstance) {
  const filters = ensureQueryFilters(query);
  filters.orMasks ??= [];
  return filters;
}

/** Compile masks and filters and report whether spawn and destroy must visit this query. */
export function compileQueryTerms(ctx: WorldContext, query: QueryInstance): boolean {
  const parameters = query.parameters;
  // Static masks are assembled after registering the modifier dependencies.
  const required: TraitInstance[] = [];
  const forbidden: TraitInstance[] = [];
  const or: TraitInstance[] = [];
  const all = query.traitInstances;
  const masks = query.masks;

  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];

    if (isIdentifierPair(parameter)) {
      (query.identifierFilters ??= []).push(parameter);
      required.push(ensureTraitInstance(ctx, parameter.identifier[$internal].trait));
      continue;
    }
    if (isIdentifier(parameter)) {
      required.push(ensureTraitInstance(ctx, parameter[$internal].trait));
      continue;
    }

    if (isRelationPair(parameter)) {
      // A wildcard pair is the relation's membership, which the required mask already checks.
      if (parameter.target !== '*')
        ensureQueryFilters(query).pairs.push(resolveRelationFilter(parameter, 1));
      const baseTrait = (parameter.relation as Relation<Trait>)[$internal].trait;
      required.push(ensureTraitInstance(ctx, baseTrait));
      query.traits.push(baseTrait);
      continue;
    }

    if (isModifier(parameter)) {
      const traits = parameter.traits;
      const pairs = parameter.pairs;
      if (parameter.type === 'not') {
        for (let j = 0; j < traits.length; j++) forbidden.push(ensureTraitInstance(ctx, traits[j]));
        if (pairs !== null)
          for (let j = 0; j < pairs.length; j++) addPairFilter(ctx, query, pairs[j], 2);
      } else if (parameter.type === 'or') {
        for (let j = 0; j < traits.length; j++) or.push(ensureTraitInstance(ctx, traits[j]));
        if (pairs !== null) {
          // An or pair can satisfy the or term alone, so the or bits are checked beside the pairs.
          ensureOrFilters(query);
          for (let j = 0; j < pairs.length; j++) addPairFilter(ctx, query, pairs[j], 3);
        }
        const nested = parameter.modifiers;
        if (nested !== null) {
          for (let j = 0; j < nested.length; j++) {
            const branch = nested[j];
            if (branch.type === 'not') {
              ensureOrFilters(query);
              const masks: number[] = [];
              const pairs: ResolvedRelationFilter[] = [];
              for (const trait of branch.traits) {
                const instance = ensureTraitInstance(ctx, trait);
                all.push(instance);
                addMaskBits(masks, instance.generationId, instance.bitflag, 2);
              }
              if (branch.pairs !== null) {
                for (const pair of branch.pairs) pairs.push(addPairFilter(ctx, query, pair, 5));
              }
              query.filters!.not.push({ masks, pairs });
            } else if (isTrackingModifier(branch)) {
              addTrackingModifier(ctx, query, branch, 'or', query.trackingGroups);
            }
          }
        }
      } else if (isTrackingModifier(parameter)) {
        addTrackingModifier(ctx, query, parameter, 'and', query.trackingGroups);
      } else {
        for (let j = 0; j < traits.length; j++) ensureTraitInstance(ctx, traits[j]);
      }
    } else {
      const t = parameter as Trait;
      required.push(ensureTraitInstance(ctx, t));
      query.traits.push(t);
    }
  }

  forbidden.push(ensureTraitInstance(ctx, IsExcluded));

  const hasNegatedOr = query.filters !== null && query.filters.not.length !== 0;
  if (
    (or.length !== 0 || query.filters?.orMasks != null) &&
    query.trackingGroups.some((group) => group.logic === 'or')
  ) {
    const filters = ensureOrFilters(query);
    filters.tracking = query.trackingGroups.every((group) => group.logic === 'or') ? 'or' : 'and';
  }

  // A lone negated branch uses the ordinary exclusion masks and pair filters.
  if (
    query.filters?.not.length === 1 &&
    or.length === 0 &&
    !query.filters.tracking &&
    !query.filters.pairs.some((filter) => filter.term === 3)
  ) {
    masks.push(...query.filters.not[0].masks);
    for (const pair of query.filters.not[0].pairs) pair.term = 2;
    query.filters.orMasks = null;
    query.filters.not = [];
    if (query.filters.pairs.length === 0) query.filters = null;
  } else if (query.filters !== null && query.filters.not.length !== 0) {
    const filters = query.filters;
    // Single absent traits share a mask check with the positive alternatives.
    filters.not = filters.not.filter(({ masks, pairs }) => {
      const bits = masks[2];
      if (pairs.length !== 0 || masks.length !== 4 || (bits & (bits - 1)) !== 0) return true;
      addMaskBits(filters.orMasks!, masks[0], bits, 2);
      return false;
    });
  }

  for (let i = 0; i < required.length; i++) {
    all.push(required[i]);
    addMaskBits(masks, required[i].generationId, required[i].bitflag, 1);
  }
  for (let i = 0; i < forbidden.length; i++) {
    all.push(forbidden[i]);
    addMaskBits(masks, forbidden[i].generationId, forbidden[i].bitflag, 2);
  }
  const orMasks = query.filters?.orMasks;
  for (let i = 0; i < or.length; i++) {
    all.push(or[i]);
    addMaskBits(orMasks ?? masks, or[i].generationId, or[i].bitflag, 3);
  }
  query.rechecks = or.length !== 0 || query.filters !== null || query.identifierFilters !== undefined;

  return (
    query.identifierFilters === undefined &&
    (query.isTracking || ((orMasks == null || hasNegatedOr) && !hasPositiveMask(masks)))
  );
}

/** A required or or bit means a matching slot holds a live entity, since destroy clears every bit. */
export function hasPositiveMask(masks: number[]) {
  for (let i = 0; i < masks.length; i += 4) if (masks[i + 1] !== 0 || masks[i + 3] !== 0) return true;
  return false;
}
