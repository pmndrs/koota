import type { QueryInstance as QueryHandle } from '../handles';
import type { SparseSet } from '../entity/entity-set';
import type { Entity } from '../entity/types';
import type { RelationPair } from '../relation/types';
import type { Trait, TraitOrRelation, TraitInstance } from '../trait/types';
import type { KernelContext } from '../context';
import { $modifier } from './modifier';
import { $parameters, $queryRef } from './symbols';

export type QueryParameter = Trait | RelationPair | Modifier;
export type QuerySubscriber = (entity: Entity) => void;
export type QueryUnsubscriber = () => void;

export type QueryHash = string;

export type Query<T extends QueryParameter[] = QueryParameter[]> = {
  readonly [$queryRef]: true;
  /** Public read-only ID for fast array lookups */
  readonly id: number;
  /** Hash string for deduplication */
  readonly hash: QueryHash;
  /** Query parameters for creating instances */
  readonly parameters: T;
  readonly [$parameters]: T;
};

export type ResolvedRelationFilter = RelationPair & {
  targetQueryRef?: Query<QueryParameter[]>;
  targetQueryMatches?: SparseSet;
};

export type Modifier<TTrait extends Trait[] = Trait[], TType extends string = string> = {
  [$modifier]: true;
  type: TType;
  id: number;
  traits: TTrait;
  traitIds: number[];
  modifiers: Modifier[] | null;
};

/** Parameter types that can be passed to Or modifier */
export type OrParameter = TraitOrRelation | Modifier;

/** Or modifier that can contain both traits and nested modifiers */
export type OrModifier<T extends OrParameter[] = OrParameter[]> = Modifier<
  ExtractTraitsFromOrParams<T>,
  'or'
> & {
  modifiers: Modifier[];
};

/** Extract traits from Or parameters (filters out modifiers) */
type ExtractTraitsFromOrParams<T extends OrParameter[]> = T extends [infer First, ...infer Rest]
  ? First extends Trait
    ? Rest extends OrParameter[]
      ? [First, ...ExtractTraitsFromOrParams<Rest>]
      : [First]
    : Rest extends OrParameter[]
      ? ExtractTraitsFromOrParams<Rest>
      : []
  : [];

/**
 * Unified tracking group that supports both AND and OR logic.
 * Replaces the old separate tracking arrays and OrTrackingGroup.
 */
export type TrackingGroup = {
  /** Whether all traits must match (and) or any trait can match (or) */
  logic: 'and' | 'or';
  /** The type of tracking event */
  type: 'add' | 'remove' | 'change';
  /** Tracking modifier ID for snapshot/mask lookups */
  id: number;
  /** Bitmasks indexed by generationId */
  bitmasks: (number | undefined)[];
  /** Per-entity tracker state indexed by [generationId][pageId][offset] */
  trackers: Uint32Array[][];
};

export type QueryInstance<T extends QueryParameter[] = QueryParameter[]> = QueryHandle & {
  version: number;
  ctx: KernelContext;
  parameters: T;
  identities: readonly Entity[] | null;
  hash: QueryHash;
  traits: Trait[];
  /** Static trait instances for non-tracking query matching */
  traitInstances: {
    required: TraitInstance[];
    forbidden: TraitInstance[];
    or: TraitInstance[];
    all: TraitInstance[];
  };
  /** Static bitmasks for non-tracking query matching (indexed by generationId) */
  staticBitmasks: {
    required: number;
    forbidden: number;
    or: number;
  }[];
  /** Unified tracking groups with explicit AND/OR logic */
  trackingGroups: TrackingGroup[];
  generations: number[];
  entities: SparseSet;
  isTracking: boolean;
  hasChangedModifiers: boolean;
  changedTraits: Set<Trait>;
  cleanup: QueryUnsubscriber[];
  addSubscriptions: Set<QuerySubscriber>;
  removeSubscriptions: Set<QuerySubscriber>;
  internalAddSubscriptions: Set<QuerySubscriber>;
  internalRemoveSubscriptions: Set<QuerySubscriber>;
  /** Relation pairs for target-specific queries */
  relationFilters?: ResolvedRelationFilter[];
  run: (ctx: KernelContext) => Entity[];
  add: (entity: Entity) => void;
  remove: (ctx: KernelContext, entity: Entity) => void;
  check: (ctx: KernelContext, entity: Entity) => boolean;
  checkTracking: (
    ctx: KernelContext,
    entity: Entity,
    eventType: 'add' | 'remove' | 'change',
    generationId: number,
    bitflag: number
  ) => boolean;
  resetTrackingBitmasks: (eid: number) => void;
};

export type EventType = 'add' | 'remove' | 'change';
