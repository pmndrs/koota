import type { Schema, StoreType } from './types';
import {StandardSchemaV1} from "../trait/standard-schema";

/**
 * Get default values from a schema.
 * Returns null for tags (empty schemas), Standard Schemas, or if no defaults exist.
 */
/* @inline @pure */ export function getSchemaDefaults(
	schema: Record<string, any> | (() => unknown),
	type: StoreType
): Record<string, any> | null {
	if (type === 'aos') {
		return typeof schema === 'function' ? (schema() as Record<string, any>) : null;
	}

	// Standard Schemas don't have defaults in the traditional sense
	if (isStandardSchema(schema)) return null;

	if (!schema || typeof schema === 'function' || Object.keys(schema).length === 0) return null;

	const defaults: Record<string, any> = {};
	for (const key in schema) {
		if (typeof schema[key] === 'function') {
			defaults[key] = schema[key]();
		} else {
			defaults[key] = schema[key];
		}
	}
	return defaults;
}

export /* @inline @pure */ function validateSchema(schema: Schema) {
	for (const key in schema) {
		const value = schema[key as keyof Schema];
		if (value !== null && typeof value === 'object') {
			const kind = Array.isArray(value) ? 'array' : 'object';
			throw new Error(`Koota: ${key} is an ${kind}, which is not supported in traits.`);
		}
	}
}

export /* @inline @pure */ function isStandardSchema(schema: Schema): schema is StandardSchemaV1 {
	return schema && typeof schema === 'object' && '~standard' in schema;
}

/**
 * Validates that a validated value from a Standard Schema doesn't contain nested objects or arrays.
 * This enforces the same restriction as regular schemas.
 */
export /* @inline @pure */ function validateStandardSchemaOutput(value: any): void {
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		for (const key in value) {
			const prop = value[key];
			if (prop !== null && typeof prop === 'object') {
				const kind = Array.isArray(prop) ? 'array' : 'object';
				throw new Error(`Koota: ${key} is an ${kind}, which is not supported in traits.`);
			}
		}
	}
}