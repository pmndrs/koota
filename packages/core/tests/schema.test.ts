import { describe, expect, it } from 'vitest';
import {
    detectKind,
    field,
    isFieldDescriptor,
    parseDefinition,
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

    describe('parseDefinition', () => {
        it('should parse shorthand number fields', () => {
            const result = parseDefinition({ x: 0, y: 0 });
            expect(result.x).toMatchObject({ kind: 'number', default: 0 });
            expect(result.y).toMatchObject({ kind: 'number', default: 0 });
        });

        it('should parse shorthand string fields', () => {
            const result = parseDefinition({ name: 'default', label: '' });
            expect(result.name).toMatchObject({ kind: 'string', default: 'default' });
            expect(result.label).toMatchObject({ kind: 'string', default: '' });
        });

        it('should parse shorthand boolean fields', () => {
            const result = parseDefinition({ active: true, visible: false });
            expect(result.active).toMatchObject({ kind: 'boolean', default: true });
            expect(result.visible).toMatchObject({ kind: 'boolean', default: false });
        });

        it('should parse shorthand bigint fields', () => {
            const result = parseDefinition({ id: 0n, count: 100n });
            expect(result.id).toMatchObject({ kind: 'bigint', default: 0n });
            expect(result.count).toMatchObject({ kind: 'bigint', default: 100n });
        });

        it('should parse shorthand ref fields (factories)', () => {
            const colorFactory = () => ({ r: 0, g: 0, b: 0 });
            const result = parseDefinition({ color: colorFactory });
            expect(result.color).toMatchObject({ kind: 'ref', default: colorFactory });
        });

        it('should pass through field() descriptors unchanged', () => {
            const descriptor = field({ kind: 'number', default: 10, min: 0 });
            const result = parseDefinition({ radius: descriptor });
            expect(result.radius).toBe(descriptor);
        });

        it('should handle mixed shorthand and field() descriptors', () => {
            const colorFactory = () => ({ r: 0, g: 0, b: 0 });
            const result = parseDefinition({
                x: 0,
                y: 0,
                color: field({ kind: 'ref', default: colorFactory }),
                name: 'entity',
            });

            expect(result.x).toMatchObject({ kind: 'number', default: 0 });
            expect(result.y).toMatchObject({ kind: 'number', default: 0 });
            expect(result.color).toMatchObject({ kind: 'ref', default: colorFactory });
            expect(result.name).toMatchObject({ kind: 'string', default: 'entity' });
        });

        it('should return empty object for factory trait', () => {
            const result = parseDefinition(() => ({ x: 0, y: 0 }));
            expect(result).toEqual({});
        });

        it('should return empty object for empty schema (tag)', () => {
            const result = parseDefinition({});
            expect(result).toEqual({});
        });

        it('should handle complex mixed definition', () => {
            const damageDescriptor = field({ kind: 'number', default: 10, min: 0, max: 100 });
            const result = parseDefinition({
                // Shorthand values
                health: 100,
                name: 'player',
                isAlive: true,
                score: 0n,
                // Factory function
                position: () => ({ x: 0, y: 0 }),
                // Full field() descriptor
                damage: damageDescriptor,
            });

            expect(result.health).toMatchObject({ kind: 'number', default: 100 });
            expect(result.name).toMatchObject({ kind: 'string', default: 'player' });
            expect(result.isAlive).toMatchObject({ kind: 'boolean', default: true });
            expect(result.score).toMatchObject({ kind: 'bigint', default: 0n });
            expect(result.position.kind).toBe('ref');
            expect(typeof result.position.default).toBe('function');
            expect(result.damage).toBe(damageDescriptor); // Same reference
            expect(result.damage.min).toBe(0);
            expect(result.damage.max).toBe(100);
        });
    });
});
