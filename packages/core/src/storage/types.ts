import type { WorldContext } from '../world/types';

/**
 * Paged storage type for trait data.
 * - AoS: store[pageId][offset] = instance
 * - SoA: store.key[pageId][offset] = value
 * - SoA tuple: store.key[pageId][offset * stride + element] = value
 * SoA column capacity may grow in place. Length is capacity, not trait membership.
 */
export type Store<T extends Schema = any> = T extends AoSFactory
  ? ReturnType<T>[][]
  : {
      [P in keyof T]: T[P] extends (...args: never[]) => unknown
        ? ReturnType<T[P]>[][]
        : T[P] extends Tuple
          ? T[P][number][][]
          : T[P][][];
    };

/**
 * Storage layout type.
 * - 'soa': Struct of Arrays - properties stored in separate arrays
 * - 'aos': Array of Structs - instances stored directly
 * - 'tag': No data storage - empty schema marker
 */
export type StoreType = 'aos' | 'soa' | 'tag';

/**
 * Schema definition for traits.
 * Can be a SoA object schema, an AoS factory function, or an empty object (tag).
 */
export type Schema = SoASchema | AoSFactory | Record<string, never>;

type SoASchema = {
  [key: string]: number | bigint | string | boolean | null | undefined | Tuple | (() => unknown);
};

/**
 * Schemas accepted by trait(). Factories return an object, or null for a reference slot that is
 * empty until set. Primitive data belongs in a field.
 */
export type TraitSchema = SoASchema | (() => object | null) | Record<string, never>;

/**
 * A field or whole trait value that has no default and must be given on add.
 * It is typed as a factory so records and stores read its value type like any other factory.
 */
export type RequiredField<T = unknown> = (() => T) & { readonly required: true };

/**
 * A fixed-length list of primitives, such as a vector, quaternion, matrix or Euler.
 * Its length is the stride of the column that stores it.
 */
type Tuple = readonly [TupleElement, ...TupleElement[]];

type TupleElement = number | bigint | string | boolean | null | undefined;

/** Widens boolean defaults, and number and string literals in readonly tuples. */
type WidenTuple<T extends Tuple> = {
  -readonly [I in keyof T]: T[I] extends boolean
    ? boolean
    : T extends unknown[]
      ? T[I]
      : T[I] extends number
        ? number
        : T[I] extends string
          ? string
          : T[I];
};

/**
 * Factory function for AoS (Array of Structs) storage.
 * Returns a single instance that will be stored per entity.
 */
export type AoSFactory = () => unknown;

/**
 * Normalizes schema types to their primitive forms.
 * Ensures that explicit values like true, false or "string literal" are
 * normalized to their primitive types (boolean, string, etc).
 */
export type Norm<T extends Schema> =
  T extends Record<string, never>
    ? T
    : T extends RequiredField
      ? T
      : T extends AoSFactory
        ? () => ReturnType<T> extends number
            ? number
            : ReturnType<T> extends boolean
              ? boolean
              : ReturnType<T> extends string
                ? string
                : ReturnType<T>
        : {
              [K in keyof T]: T[K] extends object
                ? T[K] extends ((...args: never[]) => unknown) | Tuple
                  ? T[K]
                  : never
                : T[K] extends boolean
                  ? boolean
                  : T[K];
            }[keyof T] extends never
          ? never
          : {
              [K in keyof T]: T[K] extends boolean
                ? boolean
                : T[K] extends Tuple
                  ? WidenTuple<T[K]>
                  : T[K];
            };

// Accessors share the (ctx, index, store) prefix whatever kind of trait they belong to.
export type AddAccessor = (ctx: WorldContext, index: number, store: any, value?: any) => void;

export type SetAccessor = (ctx: WorldContext, index: number, store: any, value: any) => boolean;

export type GetAccessor = (ctx: WorldContext, index: number, store: any) => any;

export type GetIntoAccessor = (ctx: WorldContext, index: number, store: any, out: any) => any;

/**
 * Source for one cursor in one generated walk. Initialize once, bind before seek, seek before flush.
 * The fragments share locals derived from the cursor name, which must be unique in the walk.
 */
export type CursorSource = {
  /** Statements that capture cursor-owned data once per walk. */
  init: string;
  bind: string;
  seek: Record<CursorKind, string>;
  /** Empty for reads and for schemas whose fields are all written in place. */
  flush: Record<CursorKind, string>;
  /** Expression for whether a write cursor changed anything since seek. */
  changed: string;
};

/** Creates runtime cursors and compiles the storage code that drives them during a walk. */
export type CursorCompiler = {
  create(): CursorSet;
  compile(cursor: string, store: string, page: string, offset: string): CursorSource;
};

/** write diffs and flags changes for tracked walks, plain stores bare, read drops writes. */
export type CursorKind = 'write' | 'plain' | 'read';

/**
 * A cursor stands in for a SoA record during a walk. Scalar fields read and write the bound page
 * at the current offset, so nothing is copied per entity. A tuple field is an array the cursor
 * owns, filled when the cursor moves and stored back after the callback.
 */
export type CursorSet = Record<CursorKind, object>;
