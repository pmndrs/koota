/**
 * Paged storage type for trait data.
 * - AoS: store[pageId][offset] = instance
 * - SoA: store.key[pageId][offset] = value
 * - SoA tuple: store.key[pageId][offset * stride + element] = value
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
export type Schema =
  | {
      [key: string]: number | bigint | string | boolean | null | undefined | Tuple | (() => unknown);
    }
  | AoSFactory
  | Record<string, never>;

/**
 * A fixed-length list of primitives, such as a vector, quaternion, matrix or Euler.
 * Its length is the stride of the column that stores it.
 */
export type Tuple = readonly [TupleElement, ...TupleElement[]];

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
