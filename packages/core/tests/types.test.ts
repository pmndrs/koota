import { describe, expectTypeOf, it } from 'vitest';
import { field, relation, trait, type ExtractType, type TagTrait } from '../src';

describe('Trait type inference', () => {
    describe('field-based schemas', () => {
        it('infers data shape from shorthand definition', () => {
            const T = trait({ x: 0, y: 0 });
            const R = relation({ x: 0, y: 0 });
            type Expected = { x: number; y: number };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('widens literal types to primitives', () => {
            const T = trait({ name: 'default', count: 42, active: true });
            const R = relation({ name: 'default', count: 42, active: true });
            type Expected = { name: string; count: number; active: boolean };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('infers data shape for ref fields from factory functions', () => {
            const T = trait({ radius: 10, color: () => ({ r: 0, g: 0, b: 0 }) });
            const R = relation({ radius: 10, color: () => ({ r: 0, g: 0, b: 0 }) });
            type Expected = { radius: number; color: { r: number; g: number; b: number } };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('handles typed factory for tuples', () => {
            const T = trait({ position: (): [number, number, number] => [0, 0, 0] });
            const R = relation({ position: (): [number, number, number] => [0, 0, 0] });
            type Expected = { position: [number, number, number] };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('accepts explicit data shape type with matching definition', () => {
            type Ball = {
                radius: number;
                color: { r: number; g: number; b: number };
                tuple: [number, number, number];
            };

            const T = trait<Ball>({
                radius: 10,
                color: () => ({ r: 0, g: 0, b: 0 }),
                tuple: (): [number, number, number] => [0, 0, 0],
            });
            const R = relation<Ball>({
                radius: 10,
                color: () => ({ r: 0, g: 0, b: 0 }),
                tuple: (): [number, number, number] => [0, 0, 0],
            });

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Ball>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Ball>();
        });
    });

    describe('factory schemas', () => {
        it('infers data shape from factory function', () => {
            const T = trait(() => ({ x: 0, y: 0 }));
            const R = relation(() => ({ x: 0, y: 0 }));
            type Expected = { x: number; y: number };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('works with array data', () => {
            const T = trait((): number[] => []);
            const R = relation((): number[] => []);

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<number[]>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<number[]>();
        });

        it('works with class instances', () => {
            class Vector3 {
                constructor(
                    public x = 0,
                    public y = 0,
                    public z = 0
                ) {}
            }
            const T = trait(() => new Vector3());
            const R = relation(() => new Vector3());

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Vector3>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Vector3>();
        });

        it('accepts explicit data shape type for factory', () => {
            class Vector3 {
                constructor(
                    public x = 0,
                    public y = 0,
                    public z = 0
                ) {}
            }
            const T = trait<Vector3>(() => new Vector3());
            const R = relation<Vector3>(() => new Vector3());

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Vector3>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Vector3>();
        });

        it('works with typed arrays', () => {
            const T = trait((): [number, number, number] => [0, 0, 0]);
            const R = relation((): [number, number, number] => [0, 0, 0]);

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<[number, number, number]>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<[number, number, number]>();
        });
    });

    describe('tags', () => {
        it('creates tag with no definition', () => {
            const T = trait();
            const R = relation();

            expectTypeOf(T).toExtend<TagTrait>();
            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Record<string, never>>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Record<string, never>>();
        });
    });

    describe('field descriptors', () => {
        it('infers data shape for all schema kinds using field()', () => {
            const schema = {
                count: field({ kind: 'number', default: 0 }),
                name: field({ kind: 'string', default: '' }),
                active: field({ kind: 'boolean', default: false }),
                id: field({ kind: 'bigint', default: 0n }),
            };
            const T = trait(schema);
            const R = relation(schema);
            type Expected = { count: number; name: string; active: boolean; id: bigint };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('infers data shape for ref kind with factory default', () => {
            const schema = { color: field({ kind: 'ref', default: () => ({ r: 0, g: 0, b: 0 }) }) };
            const T = trait(schema);
            const R = relation(schema);
            type Expected = { color: { r: number; g: number; b: number } };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('supports mixed shorthand and field descriptor format', () => {
            const schema = {
                x: 0,
                y: 0,
                name: field({ kind: 'string', default: 'entity' }),
                color: () => ({ r: 0, g: 0, b: 0 }),
            };
            const T = trait(schema);
            const R = relation(schema);
            type Expected = {
                x: number;
                y: number;
                name: string;
                color: { r: number; g: number; b: number };
            };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('supports top-level field descriptor for single-ref traits', () => {
            const desc = field({ kind: 'ref', default: () => ({ x: 0, y: 0 }) });
            const T = trait(desc);
            const R = relation(desc);
            type Expected = { x: number; y: number };

            expectTypeOf<ExtractType<typeof T>>().toEqualTypeOf<Expected>();
            expectTypeOf<ExtractType<typeof R>>().toEqualTypeOf<Expected>();
        });

        it('rejects non-ref top-level field descriptors', () => {
            // @ts-expect-error - top-level field descriptors must be ref kind
            trait(field({ kind: 'number', default: 0 }));
            // @ts-expect-error - top-level field descriptors must be ref kind
            trait(field({ kind: 'string', default: '' }));
            // @ts-expect-error - top-level field descriptors must be ref kind
            trait(field({ kind: 'boolean', default: false }));
            // @ts-expect-error - top-level field descriptors must be ref kind
            relation(field({ kind: 'number', default: 0 }));
            // @ts-expect-error - top-level field descriptors must be ref kind
            relation(field({ kind: 'string', default: '' }));
            // @ts-expect-error - top-level field descriptors must be ref kind
            relation(field({ kind: 'boolean', default: false }));
        });
    });
});
