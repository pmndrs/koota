import type { Schema } from './types';
import type { StandardSchemaV1 } from '../trait/standard-schema';
import { validateStandardSchemaOutput } from './schema';

function createSoASetFunction(schema: Schema, _validator?: StandardSchemaV1) {
	const keys = Object.keys(schema);

	// Generate a hardcoded set function based on the schema keys
	const setFunctionBody = keys
		.map((key) => `if ('${key}' in value) store.${key}[index] = value.${key};`)
		.join('\n    ');

	// Use new Function to create a set function with hardcoded keys
	const set = new Function(
		'index',
		'store',
		'value',
		`
		${setFunctionBody}
	  `
	);

	return set;
}

function createSoAFastSetFunction(schema: Schema, _validator?: StandardSchemaV1) {
	const keys = Object.keys(schema);

	// Generate a hardcoded set function based on the schema keys
	const setFunctionBody = keys.map((key) => `store.${key}[index] = value.${key};`).join('\n    ');

	// Use new Function to create a set function with hardcoded keys
	const set = new Function(
		'index',
		'store',
		'value',
		`
		${setFunctionBody}
	  `
	);

	return set;
}

// Return true if any trait value were changed.
function createSoAFastSetChangeFunction(schema: Schema, _validator?: StandardSchemaV1) {
	const keys = Object.keys(schema);

	// Generate a hardcoded set function based on the schema keys
	const setFunctionBody = keys
		.map(
			(key) =>
				`if (store.${key}[index] !== value.${key}) {
            store.${key}[index] = value.${key};
            changed = true;
        }`
		)
		.join('\n    ');

	// Use new Function to create a set function with hardcoded keys
	const set = new Function(
		'index',
		'store',
		'value',
		`
        let changed = false;
        ${setFunctionBody}
        return changed;
        `
	);

	return set;
}

function createSoAGetFunction(schema: Schema, _validator?: StandardSchemaV1) {
	const keys = Object.keys(schema);

	// Create an object literal with all keys assigned from the store
	const objectLiteral = `{ ${keys.map((key) => `${key}: store.${key}[index]`).join(', ')} }`;

	// Use new Function to create a get function that returns the pre-populated object
	const get = new Function(
		'index',
		'store',
		`
        return ${objectLiteral};
        `
	);

	return get;
}

function createAoSSetFunction(_schema: Schema, validator?: StandardSchemaV1) {
	if (validator) {
		return (index: number, store: any, value: any) => {
			const result = validator['~standard'].validate(value);

			if (result instanceof Promise) {
				throw new Error('Koota: Async validation is not supported for traits');
			}

			if ('issues' in result && result.issues) {
				const message = result.issues.map((issue: any) => issue.message).join(', ');
				throw new Error(`Koota: Trait validation failed: ${message}`);
			}

			if ('value' in result) {
				value = result.value;
				validateStandardSchemaOutput(value);
			}

			store[index] = value;
		};
	}

	return (index: number, store: any, value: any) => {
		store[index] = value;
	};
}

function createAoSFastSetChangeFunction(_schema: Schema, validator?: StandardSchemaV1) {
	if (validator) {
		return (index: number, store: any, value: any) => {
			const result = validator['~standard'].validate(value);

			if (result instanceof Promise) {
				throw new Error('Koota: Async validation is not supported for traits');
			}

			if ('issues' in result && result.issues) {
				const message = result.issues.map((issue: any) => issue.message).join(', ');
				throw new Error(`Koota: Trait validation failed: ${message}`);
			}

			if ('value' in result) {
				value = result.value;
				validateStandardSchemaOutput(value);
			}

			let changed = false;

			if (value !== store[index]) {
				store[index] = value;
				changed = true;
			}

			return changed;
		};
	}

	return (index: number, store: any, value: any) => {
		let changed = false;
		if (value !== store[index]) {
			store[index] = value;
			changed = true;
		}
		return changed;
	};
}

function createAoSGetFunction(_schema: Schema, validator?: StandardSchemaV1) {
	if (validator) {
		return (index: number, store: any) => {
			const value = store[index];

			return value ? { ...value } : value;
		};
	}

	return (index: number, store: any) => store[index];
}

const noop = () => {};
const createTagNoop = () => noop;

export const createSetFunction: Record<string, (schema: Schema, validator?: StandardSchemaV1) => any> = {
	soa: createSoASetFunction,
	aos: createAoSSetFunction,
	tag: createTagNoop,
};

export const createFastSetFunction: Record<string, (schema: Schema, validator?: StandardSchemaV1) => any> = {
	soa: createSoAFastSetFunction,
	aos: createAoSSetFunction,
	tag: createTagNoop,
};

export const createFastSetChangeFunction: Record<string, (schema: Schema, validator?: StandardSchemaV1) => any> = {
	soa: createSoAFastSetChangeFunction,
	aos: createAoSFastSetChangeFunction,
	tag: createTagNoop,
};

export const createGetFunction: Record<string, (schema: Schema, validator?: StandardSchemaV1) => any> = {
	soa: createSoAGetFunction,
	aos: createAoSGetFunction,
	tag: createTagNoop,
};
