import { describe, expectTypeOf, it } from 'vitest';
import { field, trait, type ExtractType, type TagTrait } from '../src';

describe('Trait type inference', () => {
    describe('field-based traits', () => {
        it('infers data shape from shorthand definition', () => {
            const Position = trait({ x: 0, y: 0 });

            expectTypeOf<ExtractType<typeof Position>>().toEqualTypeOf<{
                x: number;
                y: number;
            }>();
        });

        it('widens literal types to primitives', () => {
            const Config = trait({ name: 'default', count: 42, active: true });

            expectTypeOf<ExtractType<typeof Config>>().toEqualTypeOf<{
                name: string;
                count: number;
                active: boolean; // Should be boolean instead of true
            }>();
        });

        it('infers data shape for ref fields from factory functions', () => {
            const Ball = trait({
                radius: 10,
                color: () => ({ r: 0, g: 0, b: 0 }),
            });

            // For ref fields, the shape should be the return type
            expectTypeOf<ExtractType<typeof Ball>>().toEqualTypeOf<{
                radius: number;
                color: { r: number; g: number; b: number };
            }>();
        });

        it('handles typed factory for tuples', () => {
            const Transform = trait({
                position: (): [number, number, number] => [0, 0, 0],
            });

            expectTypeOf<ExtractType<typeof Transform>>().toEqualTypeOf<{
                position: [number, number, number];
            }>();
        });

        it('accepts explicit data shape type with matching definition', () => {
            type Ball = {
                radius: number;
                color: { r: number; g: number; b: number };
                tuple: [number, number, number];
            };

            // Note: tuple factory needs explicit return type because
            // () => [0, 0, 0] is inferred as () => number[], not () => [n, n, n]
            const Ball = trait<Ball>({
                radius: 10,
                color: () => ({ r: 0, g: 0, b: 0 }),
                tuple: (): [number, number, number] => [0, 0, 0],
            });

            expectTypeOf<ExtractType<typeof Ball>>().toEqualTypeOf<Ball>();
        });
    });

    describe('factory traits', () => {
        it('infers data shape from factory function', () => {
            const Position = trait(() => ({ x: 0, y: 0 }));

            expectTypeOf<ExtractType<typeof Position>>().toEqualTypeOf<{
                x: number;
                y: number;
            }>();
        });

        it('works with array data', () => {
            const Children = trait((): number[] => []);

            expectTypeOf<ExtractType<typeof Children>>().toEqualTypeOf<number[]>();
        });

        it('works with class instances', () => {
            class Vector3 {
                constructor(
                    public x = 0,
                    public y = 0,
                    public z = 0
                ) {}
            }
            const Velocity = trait(() => new Vector3());

            expectTypeOf<ExtractType<typeof Velocity>>().toEqualTypeOf<Vector3>();
        });

        it('accepts explicit data shape type for factory traits', () => {
            class Vector3 {
                constructor(
                    public x = 0,
                    public y = 0,
                    public z = 0
                ) {}
            }
            const Velocity = trait<Vector3>(() => new Vector3());

            expectTypeOf<ExtractType<typeof Velocity>>().toEqualTypeOf<Vector3>();
        });

        it('works with typed arrays', () => {
            const Positions = trait((): [number, number, number] => [0, 0, 0]);

            expectTypeOf<ExtractType<typeof Positions>>().toEqualTypeOf<[number, number, number]>();
        });
    });

    describe('tag traits', () => {
        it('creates tag with no definition', () => {
            const IsPlayer = trait();

            expectTypeOf(IsPlayer).toExtend<TagTrait>();
            expectTypeOf<ExtractType<typeof IsPlayer>>().toEqualTypeOf<Record<string, never>>();
        });
    });

    describe('field descriptors', () => {
        it('infers data shape for all schema kinds using field()', () => {
            const Config = trait({
                count: field({ kind: 'number', default: 0 }),
                name: field({ kind: 'string', default: '' }),
                active: field({ kind: 'boolean', default: false }),
                id: field({ kind: 'bigint', default: 0n }),
            });

            expectTypeOf<ExtractType<typeof Config>>().toEqualTypeOf<{
                count: number;
                name: string;
                active: boolean;
                id: bigint;
            }>();
        });

        it('infers data shape for ref kind with factory default', () => {
            const Ball = trait({
                color: field({ kind: 'ref', default: () => ({ r: 0, g: 0, b: 0 }) }),
            });

            expectTypeOf<ExtractType<typeof Ball>>().toEqualTypeOf<{
                color: { r: number; g: number; b: number };
            }>();
        });

        it('supports mixed shorthand and field descriptor format', () => {
            const Entity = trait({
                x: 0, // shorthand
                y: 0, // shorthand
                name: field({ kind: 'string', default: 'entity' }), // field descriptor
                color: () => ({ r: 0, g: 0, b: 0 }), // factory shorthand
            });

            expectTypeOf<ExtractType<typeof Entity>>().toEqualTypeOf<{
                x: number;
                y: number;
                name: string;
                color: { r: number; g: number; b: number };
            }>();
        });

        it('supports top-level field descriptor for single-ref traits', () => {
            const Position = trait(field({ kind: 'ref', default: () => ({ x: 0, y: 0 }) }));

            expectTypeOf<ExtractType<typeof Position>>().toEqualTypeOf<{
                x: number;
                y: number;
            }>();
        });

        it('rejects non-ref top-level field descriptors', () => {
            // @ts-expect-error - top-level field descriptors must be ref kind
            trait(field({ kind: 'number', default: 0 }));
            // @ts-expect-error - top-level field descriptors must be ref kind
            trait(field({ kind: 'string', default: '' }));
            // @ts-expect-error - top-level field descriptors must be ref kind
            trait(field({ kind: 'boolean', default: false }));
        });
    });
});
