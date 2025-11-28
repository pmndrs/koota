import type { TraitType } from '../types';

/**
 * Get default values from a schema.
 * Returns null for tags (empty schemas) or if no defaults exist.
 */
/* @inline */ export function getSchemaDefaults(
	schema: Record<string, any> | (() => unknown),
	type: TraitType
): Record<string, any> | null {
	if (type === 'aos') {
		return typeof schema === 'function' ? (schema() as Record<string, any>) : null;
	}

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
