import { describe, expect, it } from 'vitest';
import {
    detectKind,
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
        it('should return true for valid FieldDescriptor objects', () => {
            expect(isFieldDescriptor({ kind: 'number', default: 0 })).toBe(true);
            expect(isFieldDescriptor({ kind: 'string', default: '' })).toBe(true);
            expect(isFieldDescriptor({ kind: 'boolean', default: true })).toBe(true);
            expect(isFieldDescriptor({ kind: 'bigint', default: 0n })).toBe(true);
            expect(isFieldDescriptor({ kind: 'ref', default: () => ({}) })).toBe(true);
        });

        it('should return true for FieldDescriptor with extra properties', () => {
            expect(isFieldDescriptor({ kind: 'number', default: 0, min: 0, max: 100 })).toBe(true);
            expect(isFieldDescriptor({ kind: 'ref', required: true })).toBe(true);
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

        it('should pass through FieldDescriptor unchanged', () => {
            const descriptor: FieldDescriptor = { kind: 'number', default: 42, min: 0, max: 100 };
            const result = parseField(descriptor);
            expect(result).toBe(descriptor); // Same reference
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

        it('should pass through FieldDescriptor fields unchanged', () => {
            const descriptor: FieldDescriptor = { kind: 'number', default: 10, min: 0 };
            const result = parseDefinition({ radius: descriptor });
            expect(result.radius).toBe(descriptor);
        });

        it('should handle mixed shorthand and FieldDescriptor', () => {
            const colorFactory = () => ({ r: 0, g: 0, b: 0 });
            const result = parseDefinition({
                x: 0,
                y: 0,
                color: { kind: 'ref', default: colorFactory },
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
            const result = parseDefinition({
                // Shorthand values
                health: 100,
                name: 'player',
                isAlive: true,
                score: 0n,
                // Factory function
                position: () => ({ x: 0, y: 0 }),
                // Full FieldDescriptor
                damage: { kind: 'number', default: 10, min: 0, max: 100 },
            });

            expect(result.health).toMatchObject({ kind: 'number', default: 100 });
            expect(result.name).toMatchObject({ kind: 'string', default: 'player' });
            expect(result.isAlive).toMatchObject({ kind: 'boolean', default: true });
            expect(result.score).toMatchObject({ kind: 'bigint', default: 0n });
            expect(result.position.kind).toBe('ref');
            expect(typeof result.position.default).toBe('function');
            expect(result.damage).toEqual({ kind: 'number', default: 10, min: 0, max: 100 });
        });
    });
});
