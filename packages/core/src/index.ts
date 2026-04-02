export { createActions } from './actions/create-actions';
export type { Actions, ActionsInitializer, ActionRecord } from './actions/types';
export { $internal } from './common';
export type { Entity } from './entity/types';
export { unpackEntity } from './entity/utils/pack-entity';
export { createAdded } from './query/modifiers/added';
export { createChanged } from './query/modifiers/changed';
export { Not } from './query/modifiers/not';
export { Or } from './query/modifiers/or';
export { createRemoved } from './query/modifiers/removed';
export { $modifier } from './query/modifier';
export { createQuery, IsExcluded } from './query/query';
export type {
    EventType,
    InstancesFromParameters,
    IsNotModifier,
    Modifier,
    Query,
    QueryModifier,
    QueryParameter,
    QueryResult,
    QueryResultOptions,
    QuerySubscriber,
    QueryUnsubscriber,
    QueryHash,
    StoresFromParameters,
} from './query/types';
export { $queryRef } from './query/symbols';
export { relation } from './trait/relation';
/** @experimental This API is experimental and may change or be removed in future versions. */
export { ordered } from './trait/ordered';
/** @experimental This API is experimental and may change or be removed in future versions. */
export { OrderedList } from './trait/ordered-list';
export { isPair, isPairPattern } from './trait/utils/is-relation';
export { getStore, trait } from './trait/trait';
export type {
    TraitLike as ConfigurableTrait,
    ExtractIsTag,
    ExtractType,
    ExtractStore,
    IsTag,
    /** @experimental This type is experimental and may change or be removed in future versions. */
    OrderedRelation as OrderedTrait,
    Relation,
    Pair as RelationPair,
    PairPattern as RelationPairPattern,
    PairTarget as RelationTarget,
    SetTraitCallback,
    TagTrait,
    Trait,
    TraitRecord,
    TraitConfig as TraitTuple,
    TraitValue,
} from './trait/types';
export { field } from './storage/schema';
export { $fieldDescriptor } from './storage/types';
export type {
    AoSFactory,
    AoSSchema,
    SchemaFor,
    SchemaShorthand,
    FieldDescriptor,
    InferSchema,
    Schema,
    SoASchema,
    SchemaKind,
    Store,
    TagSchema,
    TraitKind,
    // Deprecated aliases
    Definition,
    DefinitionFor,
    InferDefinition,
} from './storage/types';

export { universe } from './universe/universe';
export type { World, WorldOptions } from './world';
export { createWorld } from './world';

/**
 * Deprecations. To be removed in v0.7.0.
 */

import { createQuery } from './query/query';
/** @deprecated Use createQuery instead */
export const cacheQuery = createQuery;
