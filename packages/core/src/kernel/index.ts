export {
  Any,
  encodeEntity,
  entityGeneration,
  entityIndex,
  encodePair,
  isPair,
  isWildcardPair,
  pairRelationIndex,
  pairTargetIndex,
  INDEX_BITS,
  INDEX_MASK,
  GENERATION_MASK,
  ENTITY_MASK,
  PAIR_FLAG,
  MAX_INDEX,
  MAX_GENERATION,
  MAX_RELATIONS,
} from './id';
export type { TraitId, Entity, PairId, TypeId } from './id';

export { revision, advanceRevision } from './revision';

export { compilePlan, readRecord, writeRecord } from './schema';
export type { Column, ColumnPlan, Factory, Schema } from './schema';

export {
  defineTrait,
  defineRelation,
  getDefinition,
  isRelation,
  isSparseTrait,
  pair,
  pairRelation,
  relationDefinition,
  setTraitHooks,
  typePlan,
  Wildcard,
} from './registry';
export type { AutoDestroy, Definition, RelationOptions, TargetDestroyHook, TraitHook, TraitHooks, TraitOptions } from './registry';

export type { Archetype, TypeRecord } from './archetype';
export { addedStamp, changedStamp } from './archetype';

export type { Store } from './store';
export { storeRow } from './store';

export {
  createWorld,
  archetypeAt,
  bumpVersion,
  getTypeVersion,
  registerArchetype,
  destroyArchetype,
  resetWorld,
  destroyWorld,
} from './world';
export type { World, WorldOptions } from './world';


export {
  createEntity,
  createEntityNow,
  createReserved,
  createReservedNow,
  reserveEntity,
  releaseReservation,
  destroyEntity,
  destroyEntityNow,
  isAlive,
  entityAt,
  getArchetype,
  entityCount,
  getEntities,
} from './entity';
export type { EntityEntry } from './entity';

export {
  addTrait,
  addTraitNow,
  addTraits,
  addTraitsNow,
  removeTrait,
  removeTraitNow,
  hasTrait,
  hasTraitUnchecked,
  getTrait,
  getTraitUnchecked,
  setTrait,
  setTraitNow,
  setTraitUnchecked,
  setTraitUncheckedNow,
  getValue,
  setValue,
  setValueNow,
  markChanged,
  markChangedNow,
  getColumns,
} from './trait';

export { beginMutation, endMutation, abortMutation, flush, discardCommands } from './commands';
export type { CommandQueue } from './commands';

export { addPair, removePair, getTargets, getFirstTarget, getSources, setSources, targetOf } from './relation';

export { ensureFilter, filterMatches, matchesTerms } from './filter';
export type { Filter } from './filter';

export {
  ADDED,
  CHANGED,
  REMOVED,
  createTracker,
  hasTrackers,
  not,
  or,
  added,
  changed,
  removed,
  targets,
  queryKey,
  peekQuery,
  resolveQuery,
  collect,
  first,
  count,
  visitArchetypes,
  entityInQuery,
  observeQuery,
  getQueryVersion,
  subscribeQuery,
} from './query';
export type {
  NotTerm,
  OrTerm,
  Query,
  QuerySubscriber,
  TargetTerm,
  Term,
  TrackEvent,
  Tracker,
  TrackTerm,
} from './query';

export { observe } from './observer';
export type { EventName, Events, Observer } from './observer';
