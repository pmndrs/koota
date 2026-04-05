import { describe, expect, it } from 'vitest';
import { createWorld, field, trait } from '../../dist';

describe('Schema', () => {
    describe('shorthand schemas', () => {
        it('should support number fields', () => {
            const Position = trait({ x: 0, y: 0 });
            const world = createWorld();
            const entity = world.spawn(Position);
            expect(entity.get(Position)).toMatchObject({ x: 0, y: 0 });
        });

        it('should support string fields', () => {
            const Name = trait({ first: 'John', last: '' });
            const world = createWorld();
            const entity = world.spawn(Name);
            expect(entity.get(Name)).toMatchObject({ first: 'John', last: '' });
        });

        it('should support boolean fields', () => {
            const Flags = trait({ active: true, visible: false });
            const world = createWorld();
            const entity = world.spawn(Flags);
            expect(entity.get(Flags)).toMatchObject({ active: true, visible: false });
        });

        it('should support bigint fields', () => {
            const BigNumbers = trait({ id: 0n, count: 100n });
            const world = createWorld();
            const entity = world.spawn(BigNumbers);
            expect(entity.get(BigNumbers)).toMatchObject({ id: 0n, count: 100n });
        });

        it('should support ref fields via factory functions', () => {
            const Color = trait({ color: () => ({ r: 0, g: 0, b: 0 }) });
            const world = createWorld();
            const entity = world.spawn(Color);
            expect(entity.get(Color)).toMatchObject({ color: { r: 0, g: 0, b: 0 } });
        });

        it('should handle mixed field types', () => {
            const Complex = trait({
                health: 100,
                name: 'player',
                isAlive: true,
                score: 0n,
                position: () => ({ x: 0, y: 0 }),
            });
            const world = createWorld();
            const entity = world.spawn(Complex);
            const val = entity.get(Complex)!;
            expect(val.health).toBe(100);
            expect(val.name).toBe('player');
            expect(val.isAlive).toBe(true);
            expect(val.score).toBe(0n);
            expect(val.position).toEqual({ x: 0, y: 0 });
        });

        it('should produce a tag trait from an empty schema', () => {
            const Tag = trait();
            const world = createWorld();
            const entity = world.spawn(Tag);
            expect(entity.has(Tag)).toBe(true);
            expect(entity.get(Tag)).toBeUndefined();
        });
    });

    describe('field() descriptors', () => {
        it('should support explicit field descriptors', () => {
            const Stats = trait({
                damage: field({ kind: 'number', default: 10 }),
            });
            const world = createWorld();
            const entity = world.spawn(Stats);
            expect(entity.get(Stats)).toMatchObject({ damage: 10 });
        });

        it('should support mixing shorthand and field() descriptors', () => {
            const colorFactory = () => ({ r: 0, g: 0, b: 0 });
            const Stats = trait({
                x: 0,
                y: 0,
                color: field({ kind: 'ref', default: colorFactory }),
                name: 'entity',
            });
            const world = createWorld();
            const entity = world.spawn(Stats);
            const val = entity.get(Stats)!;
            expect(val.x).toBe(0);
            expect(val.y).toBe(0);
            expect(val.color).toEqual({ r: 0, g: 0, b: 0 });
            expect(val.name).toBe('entity');
        });
    });

    describe('factory (AoS) schemas', () => {
        it('should support a factory function as the entire schema', () => {
            const Transform = trait(() => ({ x: 0, y: 0 }));
            const world = createWorld();
            const entity = world.spawn(Transform);
            expect(entity.get(Transform)).toEqual({ x: 0, y: 0 });
        });

        it('should create independent instances per entity', () => {
            const Inventory = trait(() => ({ items: [] as string[] }));
            const world = createWorld();
            const a = world.spawn(Inventory);
            const b = world.spawn(Inventory);
            a.get(Inventory)!.items.push('sword');
            expect(a.get(Inventory)!.items).toEqual(['sword']);
            expect(b.get(Inventory)!.items).toEqual([]);
        });
    });

    describe('setting values', () => {
        it('should accept initial values on spawn', () => {
            const Position = trait({ x: 0, y: 0 });
            const world = createWorld();
            const entity = world.spawn(Position({ x: 5, y: 10 }));
            expect(entity.get(Position)).toMatchObject({ x: 5, y: 10 });
        });

        it('should set values via entity.set', () => {
            const Position = trait({ x: 0, y: 0 });
            const world = createWorld();
            const entity = world.spawn(Position);
            entity.set(Position, { x: 42, y: 99 });
            expect(entity.get(Position)).toMatchObject({ x: 42, y: 99 });
        });
    });
});
