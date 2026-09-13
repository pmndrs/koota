import type { TraitId } from '../../kernel';
import type { Entity } from '../entity/types';
import type { Relation, RelationPair } from '../relation/types';
import type { $internal } from '../symbols';

/**
 * Factory function for AoS (Array of Structs) storage. Returns one instance
 * per entity. A factory that declares a parameter receives the entity.
 */
export type AoSFactory = (entity: Entity) => unknown;

/**
 * Schema definition for traits: a record of defaults and factories, an AoS
 * factory, or an empty record for a tag.
 */
export type Schema =
  | {
      [key: string]: number | bigint | string | boolean | null | undefined | ((entity: Entity) => unknown);
    }
  | AoSFactory
  | Record<string, never>;

/** Storage layout: 'soa' fields in columns, 'aos' one instance per entity, 'tag' nothing. */
export type StoreType = 'aos' | 'soa' | 'tag';
export type TraitType = StoreType;

/** Normalizes literal schema values to their primitive types. */
export type Norm<T extends Schema> =
  T extends Record<string, never>
    ? T
    : T extends AoSFactory
      ? (entity: Entity) => ReturnType<T> extends number
          ? number
          : ReturnType<T> extends boolean
            ? boolean
            : ReturnType<T> extends string
              ? string
              : ReturnType<T>
      : {
            [K in keyof T]: T[K] extends object
              ? T[K] extends (...args: never[]) => unknown
                ? T[K]
                : never
              : T[K] extends boolean
                ? boolean
                : T[K];
          }[keyof T] extends never
        ? never
        : {
            [K in keyof T]: T[K] extends boolean ? boolean : T[K];
          };

export type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory
  ? ReturnType<TSchema>
  : Partial<TraitRecord<TSchema>>;

/**
 * Trait behavior bound to the definition and run from the mutation path.
 * `onAdd` and `onSet` receive the record before it is committed, so edits to
 * `value` are what gets written. `onRemove` receives the departing value.
 * Relation hooks always receive the target.
 */
export type TraitHook<S extends Schema = any> = (value: TraitRecord<S>, entity: Entity, target?: Entity) => void;

/** Installed hooks, one per slot. */
export type TraitHooks<S extends Schema = any> = {
  onAdd?: TraitHook<S>;
  onSet?: TraitHook<S>;
  onRemove?: TraitHook<S>;
  onTargetDestroy?: (value: TraitRecord<S>, entity: Entity, target: Entity) => void;
};

export type TraitInternal<TSchema extends Schema = any> = {
  /** Kernel trait id. */
  readonly id: TraitId;
  readonly schema: TSchema;
  readonly type: StoreType;
  /** Installed hooks, kept for listener detection. Typed loosely so trait types stay assignable. */
  readonly hooks: TraitHooks<any>;
  /** Owning relation when this trait backs a relation. */
  relation: Relation<any> | null;
  /** Runs when the trait is first used in a world. */
};

export type Trait<TSchema extends Schema = any> = {
  (params?: TraitValue<TSchema>): [Trait<TSchema>, TraitValue<TSchema>];
  [$internal]: TraitInternal<TSchema>;
  /** Runs once the trait is constructed on an entity, before observers. Sees schema defaults, not supplied values. */
  onAdd(hook: TraitHook<TSchema>): Trait<TSchema>;
  /** Runs before a value is written, including values supplied at add time. Edits to the value are written. */
  onSet(hook: TraitHook<TSchema>): Trait<TSchema>;
  /** Runs after remove observers, while the value is still readable. */
  onRemove(hook: TraitHook<TSchema>): Trait<TSchema>;
};

export type TagTrait = Trait<Record<string, never>> & { [$internal]: { type: 'tag' } };

export type TraitTuple<T extends Trait = Trait> = [
  T,
  T extends Trait<infer S> ? (S extends AoSFactory ? ReturnType<S> : Partial<TraitRecord<S>>) : never,
];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T> | RelationPair<T>;

export type SetTraitCallback<T extends Trait | RelationPair> = (
  prev: TraitRecord<ExtractSchema<T>>
) => TraitValue<ExtractSchema<T>>;

type TraitRecordFromSchema<T extends Schema> = T extends AoSFactory
  ? ReturnType<T>
  : {
      [P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]> : T[P];
    };

/** SoA snapshot of one entity's fields, or the AoS instance. */
export type TraitRecord<T extends Trait | Schema> = T extends Trait
  ? TraitRecordFromSchema<T[typeof $internal]['schema']>
  : TraitRecordFromSchema<T>;

export type ExtractSchema<T extends Trait | Relation<Trait> | RelationPair> =
  T extends RelationPair<infer R>
    ? ExtractSchema<R>
    : T extends Relation<infer R>
      ? ExtractSchema<R>
      : T extends Trait<infer S>
        ? S
        : never;

/** Column view of a trait inside one query page: one plain array per field. */
export type Store<T extends Schema = any> = T extends AoSFactory
  ? ReturnType<T>[]
  : {
      [P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]>[] : T[P][];
    };

export type ExtractStore<T extends Trait> = T extends Trait<infer S> ? Store<S> : never;
export type ExtractIsTag<T extends Trait> = T extends { [$internal]: { type: 'tag' } } ? true : false;
export type IsTag<T extends Trait> = ExtractIsTag<T>;

export type TraitOrRelation = Trait | Relation<Trait>;

/** Extracts the underlying Trait from a TraitOrRelation (Relations contain a Trait) */
export type ExtractTrait<T> = T extends Relation<infer TTrait> ? TTrait : T;

/** Maps a tuple of TraitOrRelation to their underlying Traits */
export type ExtractTraits<T extends TraitOrRelation[]> = {
  [K in keyof T]: ExtractTrait<T[K]>;
};

export type VersionSource = { readonly version: number };
