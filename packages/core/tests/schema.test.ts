import { describe, expect, it } from 'vitest';
import {
    detectKind,
    field,
    isFieldDescriptor,
    normalizeSchema,
    parseField,
    type FieldDescriptor,
} from '../src/storage';

describe('Schema', () => {
    describe('detectKind', () => {
        it('should detect number kind', () => {
            expect(detectKind(0)).toBe('number');
            expect(detectKind(42)).toBe('number');
            expect(detectKind(-1.5)).toBe('number');
            expect(detectKind(Infinity)).toBe('number');
            expect(detectKind(NaN)).toBe('number');
        });

        it('should detect string kind', () => {
            expect(detectKind('')).toBe('string');
            expect(detectKind('hello')).toBe('string');
        });

        it('should detect boolean kind', () => {
            expect(detectKind(true)).toBe('boolean');
            expect(detectKind(false)).toBe('boolean');
        });

        it('should detect bigint kind', () => {
            expect(detectKind(0n)).toBe('bigint');
            expect(detectKind(BigInt(42))).toBe('bigint');
        });

        it('should detect ref kind for functions', () => {
            expect(detectKind(() => ({}))).toBe('ref');
            expect(detectKind(() => [])).toBe('ref');
            expect(detectKind(function () {})).toBe('ref');
        });

        it('should detect ref kind for null/undefined', () => {
            expect(detectKind(null)).toBe('ref');
            expect(detectKind(undefined)).toBe('ref');
        });
    });

    describe('isFieldDescriptor', () => {
        it('should return true for field() created descriptors', () => {
            expect(isFieldDescriptor(field({ kind: 'number', default: 0 }))).toBe(true);
            expect(isFieldDescriptor(field({ kind: 'string', default: '' }))).toBe(true);
            expect(isFieldDescriptor(field({ kind: 'boolean', default: true }))).toBe(true);
            expect(isFieldDescriptor(field({ kind: 'bigint', default: 0n }))).toBe(true);
            expect(isFieldDescriptor(field({ kind: 'ref', default: () => ({}) }))).toBe(true);
        });

        it('should return true for field() with extra properties', () => {
            expect(isFieldDescriptor(field({ kind: 'number', default: 0, min: 0, max: 100 }))).toBe(
                true
            );
            expect(isFieldDescriptor(field({ kind: 'ref', required: true }))).toBe(true);
        });

        it('should return false for plain objects without field()', () => {
            // Plain objects without $fieldDescriptor symbol should NOT be detected
            expect(isFieldDescriptor({ kind: 'number', default: 0 })).toBe(false);
            expect(isFieldDescriptor({ kind: 'string', default: '' })).toBe(false);
            expect(isFieldDescriptor({ kind: 'ref', default: () => ({}) })).toBe(false);
        });

        it('should return false for non-FieldDescriptor values', () => {
            expect(isFieldDescriptor(null)).toBe(false);
            expect(isFieldDescriptor(undefined)).toBe(false);
            expect(isFieldDescriptor(0)).toBe(false);
            expect(isFieldDescriptor('string')).toBe(false);
            expect(isFieldDescriptor({})).toBe(false);
            expect(isFieldDescriptor({ kind: 'invalid' })).toBe(false);
            expect(isFieldDescriptor({ default: 0 })).toBe(false);
        });
    });

    describe('parseField', () => {
        it('should parse number shorthand', () => {
            const result = parseField(0);
            expect(result).toMatchObject({ kind: 'number', default: 0 });
        });

        it('should parse string shorthand', () => {
            const result = parseField('hello');
            expect(result).toMatchObject({ kind: 'string', default: 'hello' });
        });

        it('should parse boolean shorthand', () => {
            const result = parseField(true);
            expect(result).toMatchObject({ kind: 'boolean', default: true });
        });

        it('should parse bigint shorthand', () => {
            const result = parseField(1n);
            expect(result).toMatchObject({ kind: 'bigint', default: 1n });
        });

        it('should parse function shorthand as ref', () => {
            const factory = () => ({ x: 0, y: 0 });
            const result = parseField(factory);
            expect(result).toMatchObject({ kind: 'ref', default: factory });
        });

        it('should pass through field() descriptor unchanged', () => {
            const descriptor = field({ kind: 'number', default: 42, min: 0, max: 100 });
            const result = parseField(descriptor);
            expect(result).toBe(descriptor); // Same reference
        });

        it('should parse plain object (without field()) as ref', () => {
            // Plain objects without $fieldDescriptor are treated as ref shorthand
            const plainObj = { kind: 'number', default: 0 };
            const result = parseField(plainObj);
            expect(result).toMatchObject({ kind: 'ref', default: plainObj });
        });
    });

    describe('normalizeSchema', () => {
        it('should parse shorthand number fields into SoA schema', () => {
            const result = normalizeSchema({ x: 0, y: 0 });
            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.x).toMatchObject({ kind: 'number', default: 0 });
            expect(result.fields.y).toMatchObject({ kind: 'number', default: 0 });
        });

        it('should parse shorthand string fields into SoA schema', () => {
            const result = normalizeSchema({ name: 'default', label: '' });
            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.name).toMatchObject({ kind: 'string', default: 'default' });
            expect(result.fields.label).toMatchObject({ kind: 'string', default: '' });
        });

        it('should parse shorthand boolean fields into SoA schema', () => {
            const result = normalizeSchema({ active: true, visible: false });
            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.active).toMatchObject({ kind: 'boolean', default: true });
            expect(result.fields.visible).toMatchObject({ kind: 'boolean', default: false });
        });

        it('should parse shorthand bigint fields into SoA schema', () => {
            const result = normalizeSchema({ id: 0n, count: 100n });
            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.id).toMatchObject({ kind: 'bigint', default: 0n });
            expect(result.fields.count).toMatchObject({ kind: 'bigint', default: 100n });
        });

        it('should parse shorthand ref fields (factories) into SoA schema', () => {
            const colorFactory = () => ({ r: 0, g: 0, b: 0 });
            const result = normalizeSchema({ color: colorFactory });
            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.color).toMatchObject({ kind: 'ref', default: colorFactory });
        });

        it('should pass through field() descriptors unchanged in SoA schema', () => {
            const descriptor = field({ kind: 'number', default: 10, min: 0 });
            const result = normalizeSchema({ radius: descriptor });
            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.radius).toBe(descriptor);
        });

        it('should handle mixed shorthand and field() descriptors in SoA schema', () => {
            const colorFactory = () => ({ r: 0, g: 0, b: 0 });
            const result = normalizeSchema({
                x: 0,
                y: 0,
                color: field({ kind: 'ref', default: colorFactory }),
                name: 'entity',
            });

            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.x).toMatchObject({ kind: 'number', default: 0 });
            expect(result.fields.y).toMatchObject({ kind: 'number', default: 0 });
            expect(result.fields.color).toMatchObject({ kind: 'ref', default: colorFactory });
            expect(result.fields.name).toMatchObject({ kind: 'string', default: 'entity' });
        });

        it('should return AoS schema for factory trait', () => {
            const factory = () => ({ x: 0, y: 0 });
            const result = normalizeSchema(factory);
            expect(result.kind).toBe('aos');
            if (result.kind !== 'aos') throw new Error();
            expect(result.descriptor.kind).toBe('ref');
            expect(result.descriptor.default).toBe(factory);
        });

        it('should return tag schema for empty definition', () => {
            const result = normalizeSchema({});
            expect(result.kind).toBe('tag');
        });

        it('should handle complex mixed definition into SoA schema', () => {
            const damageDescriptor = field({ kind: 'number', default: 10, min: 0, max: 100 });
            const result = normalizeSchema({
                health: 100,
                name: 'player',
                isAlive: true,
                score: 0n,
                position: () => ({ x: 0, y: 0 }),
                damage: damageDescriptor,
            });

            expect(result.kind).toBe('soa');
            if (result.kind !== 'soa') throw new Error();
            expect(result.fields.health).toMatchObject({ kind: 'number', default: 100 });
            expect(result.fields.name).toMatchObject({ kind: 'string', default: 'player' });
            expect(result.fields.isAlive).toMatchObject({ kind: 'boolean', default: true });
            expect(result.fields.score).toMatchObject({ kind: 'bigint', default: 0n });
            expect(result.fields.position.kind).toBe('ref');
            expect(typeof result.fields.position.default).toBe('function');
            expect(result.fields.damage).toBe(damageDescriptor);
            expect(result.fields.damage.min).toBe(0);
            expect(result.fields.damage.max).toBe(100);
        });
    });
});
