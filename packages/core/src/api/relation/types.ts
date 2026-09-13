import type { TraitId } from '../../kernel';
import type { Entity } from '../entity/types';
import type { Query, QueryParameter } from '../query/types';
import type { $internal, $relation, $relationPair } from '../symbols';
import type { Trait, TraitRecord } from '../trait/types';

export type RelationTarget = Entity | '*';
export type RelationInputTarget = RelationTarget | Query<QueryParameter[]> | readonly QueryParameter[];

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
  (targetQuery: Query<QueryParameter[]>): QueryRelationPair<T>;
  (...targetQuery: [QueryParameter, ...QueryParameter[]]): QueryRelationPair<T>;
  (target: RelationTarget, params?: Record<string, unknown>): ConcreteRelationPair<T>;
};

export type RelationInternal<T extends Trait = Trait> = {
  /** Kernel relation id. */
  readonly id: TraitId;
  readonly trait: T;
  readonly exclusive: boolean;
  readonly autoDestroy: 'source' | 'target' | false;
};

/** Relation hooks always receive the pair's target. */
export type RelationHook<T extends Trait = Trait> = (value: TraitRecord<T>, entity: Entity, target: Entity) => void;

export type Relation<T extends Trait = Trait> = {
  readonly [$relation]: true;
  readonly [$internal]: RelationInternal<T>;
  /** Runs once a pair is constructed on a source, before observers. */
  onAdd(hook: RelationHook<T>): Relation<T>;
  /** Runs before pair data is written, including data supplied at add time. */
  onSet(hook: RelationHook<T>): Relation<T>;
  /** Runs after remove observers, while the pair data is still readable. */
  onRemove(hook: RelationHook<T>): Relation<T>;
  /** Runs per source when the target is destroyed, before the pair is removed and before any cascade. */
  onTargetDestroy(hook: RelationHook<T>): Relation<T>;
} & RelationCall<T>;
