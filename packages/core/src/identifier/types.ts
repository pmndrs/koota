import type { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { TagTrait } from '../trait/types';
import type { $identifier, $identifierPair } from './symbols';

export type IdentifierKey = string | number;

/** A namespace with at most one key per entity and one owner per key in each world. */
export type Identifier<K extends IdentifierKey = any> = {
  readonly [$identifier]: true;
  readonly id: number;
  readonly [$internal]: { readonly trait: TagTrait };
  (key: K): IdentifierPair<K>;
};

/** An exact key term used to assign, remove, test, look up or query a mapping. */
export type IdentifierPair<K extends IdentifierKey = any> = {
  readonly [$identifierPair]: true;
  readonly identifier: Identifier<K>;
  readonly target: K;
};

export type IdentifierIndex = {
  /** Entity id to key, paged like trait storage. Undefined means no assignment. */
  targets: (IdentifierKey | undefined)[][];
  /** Key to live owner. Both directions are committed before queries or callbacks run. */
  owners: Map<IdentifierKey, Entity>;
  /** Static queries that filter by a key, so an assignment visits only the queries for its key. */
  queries: Map<IdentifierKey, QueryInstance[]>;
};
