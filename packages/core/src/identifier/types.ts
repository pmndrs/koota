import type { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { TagTrait } from '../trait/types';
import type { $identifier, $identifierPair } from './symbols';

export type IdentifierKey = string | number;

export type IdentifierOptions = {
  /** Whether each key can belong to only one entity per world. Defaults to true. */
  exclusive?: boolean;
};

/** A namespace with at most one key per entity. Keys are exclusive by default. */
export type Identifier<K extends IdentifierKey = any> = {
  readonly [$identifier]: true;
  readonly id: number;
  readonly [$internal]: { readonly trait: TagTrait; readonly exclusive: boolean };
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
  /** Store one owner directly and promote to a dense array when a key is shared. */
  owners: Map<IdentifierKey, Entity | Entity[]>;
  /** Entity id to its shared-owner offset. Allocated only when a key is shared. */
  positions: number[][] | undefined;
  /** Static queries that filter by a key, so an assignment visits only the queries for its key. */
  queries: Map<IdentifierKey, QueryInstance[]>;
};
