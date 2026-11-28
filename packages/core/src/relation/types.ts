import type { Entity } from '../entity/types';
import type { Identifier } from '../identifier/types';
import type { $internal } from '../internal';
import type { Query, QueryParameter } from '../query/types';
import type { AoSFactory, RequiredField, Schema, TraitSchema } from '../storage/types';
import type { Trait, TraitInit } from '../trait/types';
import type { MutableOrderedView } from '../view/types';
import type { $orderedTargetsTrait, $relation, $relationPair } from './relation';

export type RelationTarget = Entity | '*';
export type RelationTargetPages = ((Entity | Entity[] | undefined)[] | undefined)[];
export type RelationInputTarget =
  RelationTarget | Query<QueryParameter[]> | readonly QueryParameter[];

/**
 * The store values a pair takes on add. Required fields must be present and the rest fall back to
 * defaults. A factory store lays the values over its own record, and a required store takes the
 * record itself.
 */
type RelationInit<T extends Trait = Trait> =
  T extends Trait<infer S extends Schema>
    ? S extends RequiredField
      ? ReturnType<S>
      : S extends AoSFactory
        ? Partial<ReturnType<S>>
        : TraitInit<S>
    : never;

interface ConcreteRelationPair<
  T extends Trait = Trait,
  Exclusive extends boolean = boolean,
  Target extends RelationTarget = RelationTarget,
> {
  readonly [$relationPair]: true;
  readonly relation: Relation<T, Exclusive>;
  readonly target: Target;
  readonly targetQuery?: undefined;
  readonly params?: RelationInit<T>;
}

export interface QueryRelationPair<T extends Trait = Trait, Exclusive extends boolean = boolean> {
  readonly [$relationPair]: true;
  readonly relation: Relation<T, Exclusive>;
  readonly target?: undefined;
  readonly targetQuery: Query<QueryParameter[]> | readonly QueryParameter[];
  readonly params?: undefined;
}

/** A pair represents a relation + target combination */
export type RelationPair<T extends Trait = Trait> = ConcreteRelationPair<T> | QueryRelationPair<T>;

/**
 * A pair that add accepts. A pair names its relation and target for reads and queries too, so
 * only add needs the values. When the store has a required field the pair must carry them.
 */
export type ConfigurablePair<T extends Trait = Trait> =
  | (RelationPair<T> & {
      readonly relation: {
        readonly [$internal]: {
          readonly trait: { readonly [$internal]: { readonly required: false } };
        };
      };
    })
  | (ConcreteRelationPair<T> & { readonly params: object });

type RelationCall<T extends Trait, Exclusive extends boolean> = {
  (
    target: '*',
    params: RelationInit<T>
  ): ConcreteRelationPair<T, Exclusive, '*'> & {
    readonly params: RelationInit<T>;
  };
  (
    target: Entity,
    params: RelationInit<T>
  ): ConcreteRelationPair<T, Exclusive, Entity> & {
    readonly params: RelationInit<T>;
  };
  (
    target: RelationTarget,
    params: RelationInit<T>
  ): ConcreteRelationPair<T, Exclusive> & {
    readonly params: RelationInit<T>;
  };
  (target: '*', params?: RelationInit<T>): ConcreteRelationPair<T, Exclusive, '*'>;
  (target: Entity, params?: RelationInit<T>): ConcreteRelationPair<T, Exclusive, Entity>;
  (target: RelationTarget, params?: RelationInit<T>): ConcreteRelationPair<T, Exclusive>;
  (targetQuery: Query<QueryParameter[]>): QueryRelationPair<T, Exclusive>;
  (...targetQuery: [QueryParameter, ...QueryParameter[]]): QueryRelationPair<T, Exclusive>;
};

export type Relation<T extends Trait = Trait, Exclusive extends boolean = boolean> = {
  readonly [$relation]: true;
  /** Create a record of the relation store defaults, such as a scratch record for get to fill. */
  readonly record: T['record'];
  [$internal]: {
    trait: T;
    exclusive: Exclusive;
    /** Forward target pages of worlds that share entity ids. */
    sharedTargets: RelationTargetPages | undefined;
    sharedTargetPageCount: number;
    autoDestroy: 'source' | 'target' | false;
    scopedIdentifiers: Identifier[] | undefined;
  };
} & RelationCall<T, Exclusive>;

export interface OrderedRelation<T extends Trait = Trait> extends Trait<
  () => MutableOrderedView<[]>
> {
  [$orderedTargetsTrait]: {
    relation: Relation<T>;
  };
}

export type RelationDefinition<S extends TraitSchema> = {
  exclusive?: boolean;
  autoDestroy?: 'orphan' | 'source' | 'target';
  /** @deprecated Use `autoDestroy: 'orphan'` instead */
  autoRemoveTarget?: boolean;
  store?: S;
};

/** The sources of one target, tagged with the handle of that target. */
export type RelationSources = Entity[] & { target?: Entity };
