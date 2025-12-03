import { Schema } from '../types';

export /* @inline @pure */ function validateSchema(schema: Schema) {
	for (const key in schema) {
		const value = schema[key as keyof Schema];
		if (value !== null && typeof value === 'object') {
			const kind = Array.isArray(value) ? 'array' : 'object';
			throw new Error(`Koota: ${key} is an ${kind}, which is not supported in traits.`);
		}
	}
}
