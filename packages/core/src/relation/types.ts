import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { Query, QueryParameter } from '../query/types';
import type { AoSFactory, RequiredField, Schema } from '../storage';
import type { Trait, TraitInit } from '../trait/types';
import type { MutableOrderedView } from '../view/types';
import { $orderedTargetsTrait, $relation, $relationPair } from './symbols';

export type RelationTarget = Entity | '*';
export type RelationInputTarget =
  RelationTarget | Query<QueryParameter[]> | readonly QueryParameter[];

/**
 * The store values a pair takes on add. Required fields must be present and the rest fall back to
 * defaults. A factory store lays the values over its own record, and a required store takes the
 * record itself.
 */
export type RelationInit<T extends Trait = Trait> =
  T extends Trait<infer S extends Schema>
    ? S extends RequiredField
      ? ReturnType<S>
      : S extends AoSFactory
        ? Partial<ReturnType<S>>
        : TraitInit<S>
    : never;

export interface ConcreteRelationPair<T extends Trait = Trait> {
  readonly [$relationPair]: true;
  readonly relation: Relation<T>;
  readonly target: RelationTarget;
  readonly targetQuery?: undefined;
  readonly params?: RelationInit<T>;
}

export interface QueryRelationPair<T extends Trait = Trait> {
  readonly [$relationPair]: true;
  readonly relation: Relation<T>;
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

type RelationCall<T extends Trait = Trait> = {
  (
    target: RelationTarget,
    params: RelationInit<T>
  ): ConcreteRelationPair<T> & { readonly params: RelationInit<T> };
  (target: RelationTarget, params?: RelationInit<T>): ConcreteRelationPair<T>;
  (targetQuery: Query<QueryParameter[]>): QueryRelationPair<T>;
  (...targetQuery: [QueryParameter, ...QueryParameter[]]): QueryRelationPair<T>;
};

export type Relation<T extends Trait = Trait> = {
  readonly [$relation]: true;
  /** Create a record of the relation store defaults, such as a scratch record for get to fill. */
  readonly record: T['record'];
  [$internal]: {
    trait: T;
    exclusive: boolean;
    autoDestroy: 'source' | 'target' | false;
  };
} & RelationCall<T>;

export interface OrderedRelation<T extends Trait = Trait> extends Trait<
  () => MutableOrderedView<[]>
> {
  [$orderedTargetsTrait]: {
    relation: Relation<T>;
  };
}
