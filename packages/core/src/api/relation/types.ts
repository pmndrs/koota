import type { Entity } from '../entity/types';
import type { Query, QueryParameter } from '../query/types';
import type { Trait } from '../trait/types';
import type { OrderedList } from './ordered-list';
import { $orderedTargetsTrait } from './symbols';
import { $relationPair, type Relation as KernelRelation } from '../../kernel';

export type RelationTarget = Entity | '*';
export type RelationInputTarget =
  RelationTarget | Query<QueryParameter[]> | readonly QueryParameter[];

export interface ConcreteRelationPair<T extends Trait = Trait> {
  readonly [$relationPair]: true;
  readonly relation: Relation<T>;
  readonly target: RelationTarget;
  readonly targetQuery?: undefined;
  readonly params?: Record<string, unknown>;
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

type RelationCall<T extends Trait = Trait> = {
  (target: RelationTarget, params?: Record<string, unknown>): ConcreteRelationPair<T>;
  (targetQuery: Query<QueryParameter[]>): QueryRelationPair<T>;
  (...targetQuery: [QueryParameter, ...QueryParameter[]]): QueryRelationPair<T>;
};

/**
 * The public relation. The kernel owns the `[$internal]` shape; the API adds
 * the call signatures that turn a relation into a pair (`ChildOf(parent)`).
 */
export type Relation<T extends Trait = Trait> = KernelRelation<T> & RelationCall<T>;

export interface OrderedRelation<T extends Trait = Trait> extends Trait<() => OrderedList> {
  [$orderedTargetsTrait]: {
    relation: Relation<T>;
  };
}
