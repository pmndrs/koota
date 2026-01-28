/**
 * Internal tests for typed field implementation details.
 * These test internal APIs that are not part of the public interface.
 */
import { describe, expect, it } from 'vitest';
import {
    $typedArray,
    types,
    isTypedField,
    isTypedSchema,
    isTypedFieldObject,
    getTypedArrayConstructor,
    getTypedFieldDefault,
    getTypedFieldBytesPerElement,
} from '../src/types';

describe('Type Helpers', () => {
    describe('types factory', () => {
        it('should create f32 typed fields', () => {
            const field = types.f32(42);
            expect(field[$typedArray]).toBe(Float32Array);
            expect(field.default).toBe(42);
        });

        it('should create f64 typed fields', () => {
            const field = types.f64(3.14);
            expect(field[$typedArray]).toBe(Float64Array);
            expect(field.default).toBe(3.14);
        });

        it('should create i8 typed fields', () => {
            const field = types.i8(-128);
            expect(field[$typedArray]).toBe(Int8Array);
            expect(field.default).toBe(-128);
        });

        it('should create i16 typed fields', () => {
            const field = types.i16(-32768);
            expect(field[$typedArray]).toBe(Int16Array);
            expect(field.default).toBe(-32768);
        });

        it('should create i32 typed fields', () => {
            const field = types.i32(-2147483648);
            expect(field[$typedArray]).toBe(Int32Array);
            expect(field.default).toBe(-2147483648);
        });

        it('should create u8 typed fields', () => {
            const field = types.u8(255);
            expect(field[$typedArray]).toBe(Uint8Array);
            expect(field.default).toBe(255);
        });

        it('should create u16 typed fields', () => {
            const field = types.u16(65535);
            expect(field[$typedArray]).toBe(Uint16Array);
            expect(field.default).toBe(65535);
        });

        it('should create u32 typed fields', () => {
            const field = types.u32(4294967295);
            expect(field[$typedArray]).toBe(Uint32Array);
            expect(field.default).toBe(4294967295);
        });

        it('should default to 0 when no default provided', () => {
            const field = types.f32();
            expect(field.default).toBe(0);
        });
    });

    describe('isTypedField', () => {
        it('should return true for typed fields', () => {
            expect(isTypedField(types.f32(0))).toBe(true);
            expect(isTypedField(types.i32(0))).toBe(true);
            expect(isTypedField(types.u8(0))).toBe(true);
        });

        it('should return false for non-typed values', () => {
            expect(isTypedField(0)).toBe(false);
            expect(isTypedField('string')).toBe(false);
            expect(isTypedField(null)).toBe(false);
            expect(isTypedField(undefined)).toBe(false);
            expect(isTypedField({})).toBe(false);
            expect(isTypedField({ [$typedArray]: Float32Array })).toBe(true); // Has symbol
            expect(isTypedField(() => 0)).toBe(false);
        });
    });

    describe('isTypedSchema', () => {
        it('should return true for schemas with all typed fields', () => {
            expect(isTypedSchema({ x: types.f32(0), y: types.f32(0) })).toBe(true);
            expect(isTypedSchema({ a: types.i32(0), b: types.u8(0) })).toBe(true);
        });

        it('should return false for schemas with non-typed fields', () => {
            expect(isTypedSchema({ x: 0, y: 0 })).toBe(false);
            expect(isTypedSchema({ x: types.f32(0), y: 0 })).toBe(false);
        });

        it('should return false for empty schemas (tags)', () => {
            expect(isTypedSchema({})).toBe(false);
        });
    });

    describe('isTypedFieldObject', () => {
        it('should return true for objects with all typed fields', () => {
            expect(isTypedFieldObject({ x: types.f32(0), y: types.f32(0) })).toBe(true);
        });

        it('should return false for objects with non-typed fields', () => {
            expect(isTypedFieldObject({ x: 0, y: 0 })).toBe(false);
            expect(isTypedFieldObject({ x: types.f32(0), y: 0 })).toBe(false);
        });

        it('should return false for empty objects', () => {
            expect(isTypedFieldObject({})).toBe(false);
        });

        it('should return false for non-objects', () => {
            expect(isTypedFieldObject(null)).toBe(false);
            expect(isTypedFieldObject(undefined)).toBe(false);
            expect(isTypedFieldObject(42)).toBe(false);
            expect(isTypedFieldObject('string')).toBe(false);
        });
    });

    describe('utility functions', () => {
        it('should get TypedArray constructor from field', () => {
            expect(getTypedArrayConstructor(types.f32(0))).toBe(Float32Array);
            expect(getTypedArrayConstructor(types.i32(0))).toBe(Int32Array);
        });

        it('should get default value from field', () => {
            expect(getTypedFieldDefault(types.f32(42))).toBe(42);
            expect(getTypedFieldDefault(types.i32(-100))).toBe(-100);
        });

        it('should get bytes per element from field', () => {
            expect(getTypedFieldBytesPerElement(types.f32(0))).toBe(4);
            expect(getTypedFieldBytesPerElement(types.f64(0))).toBe(8);
            expect(getTypedFieldBytesPerElement(types.i8(0))).toBe(1);
            expect(getTypedFieldBytesPerElement(types.i16(0))).toBe(2);
            expect(getTypedFieldBytesPerElement(types.i32(0))).toBe(4);
            expect(getTypedFieldBytesPerElement(types.u8(0))).toBe(1);
            expect(getTypedFieldBytesPerElement(types.u16(0))).toBe(2);
            expect(getTypedFieldBytesPerElement(types.u32(0))).toBe(4);
        });
    });
});
