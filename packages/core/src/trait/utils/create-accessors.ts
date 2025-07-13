import { isObject } from '../../utils/is';
import type { Schema } from '../types';

function generateGetObjectLiteral(schema: Schema, storePath: string): string {
	if (typeof schema === 'function') {
		throw new Error('Koota: SoA getter generation encountered a function schema');
	}

	const assignments = Object.keys(schema).map((key) => {
		const value = schema[key];

		if (isObject(value)) {
			return `${key}: ${generateGetObjectLiteral(value as Schema, `${storePath}.${key}`)}`;
		} else {
			return `${key}: ${storePath}.${key}[index]`;
		}
	});

	return `{ ${assignments.join(', ')} }`;
}

function generateSetStatements(
	schema: Schema,
	storePath: string,
	valuePath: string,
	checkExists: boolean = true
): string {
	if (typeof schema === 'function') {
		throw new Error('Koota: SoA setter generation encountered a function schema');
	}

	const statements = Object.keys(schema).map((key) => {
		const value = schema[key];
		const currentStorePath = `${storePath}.${key}`;
		const currentValuePath = `${valuePath}.${key}`;

		if (isObject(value)) {
			const condition = checkExists ? `'${key}' in ${valuePath} && ` : '';
			return `if (${condition}${currentValuePath} !== undefined) {\n        ${generateSetStatements(
				value as Schema,
				currentStorePath,
				currentValuePath,
				false
			)}\n    }`;
		} else {
			const condition = checkExists ? `'${key}' in ${valuePath} && ` : '';
			return `if (${condition}${currentValuePath} !== undefined) ${currentStorePath}[index] = ${currentValuePath};`;
		}
	});

	return statements.join('\n    ');
}

function generateFastSetStatements(schema: Schema, storePath: string, valuePath: string): string {
	if (typeof schema === 'function') {
		throw new Error('Koota: SoA fast setter generation encountered a function schema');
	}

	const statements = Object.keys(schema).map((key) => {
		const value = schema[key];
		const currentStorePath = `${storePath}.${key}`;
		const currentValuePath = `${valuePath}.${key}`;

		if (isObject(value)) {
			return generateFastSetStatements(value as Schema, currentStorePath, currentValuePath);
		} else {
			return `${currentStorePath}[index] = ${currentValuePath};`;
		}
	});

	return statements.join('\n    ');
}

function generateFastSetChangeStatements(
	schema: Schema,
	storePath: string,
	valuePath: string
): string {
	if (typeof schema === 'function') {
		throw new Error('Koota: SoA fast setter change generation encountered a function schema');
	}

	const statements = Object.keys(schema).map((key) => {
		const value = schema[key];
		const currentStorePath = `${storePath}.${key}`;
		const currentValuePath = `${valuePath}.${key}`;

		if (isObject(value)) {
			return generateFastSetChangeStatements(
				value as Schema,
				currentStorePath,
				currentValuePath
			);
		} else {
			return `if (${currentStorePath}[index] !== ${currentValuePath}) {
            ${currentStorePath}[index] = ${currentValuePath};
            changed = true;
        }`;
		}
	});

	return statements.join('\n    ');
}

function createSoASetFunction(schema: Schema) {
	// Generate a hardcoded set function based on the schema keys
	const setFunctionBody = generateSetStatements(schema, 'store', 'value');

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

function createSoAFastSetFunction(schema: Schema) {
	// Generate a hardcoded set function based on the schema keys
	const setFunctionBody = generateFastSetStatements(schema, 'store', 'value');

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
function createSoAFastSetChangeFunction(schema: Schema) {
	// Generate a hardcoded set function based on the schema keys
	const setFunctionBody = generateFastSetChangeStatements(schema, 'store', 'value');

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

function createSoAGetFunction(schema: Schema) {
	// Create an object literal with all keys assigned from the store
	const objectLiteral = generateGetObjectLiteral(schema, 'store');

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

function createAoSSetFunction(_schema: Schema) {
	return (index: number, store: any, value: any) => {
		store[index] = value;
	};
}

function createAoSFastSetChangeFunction(_schema: Schema) {
	return (index: number, store: any, value: any) => {
		let changed = false;
		if (value !== store[index]) {
			store[index] = value;
			changed = true;
		}
		return changed;
	};
}

function createAoSGetFunction(_schema: Schema) {
	return (index: number, store: any) => store[index];
}

export const createSetFunction = {
	soa: createSoASetFunction,
	aos: createAoSSetFunction,
};

export const createFastSetFunction = {
	soa: createSoAFastSetFunction,
	aos: createAoSSetFunction,
};

export const createFastSetChangeFunction = {
	soa: createSoAFastSetChangeFunction,
	aos: createAoSFastSetChangeFunction,
};

export const createGetFunction = {
	soa: createSoAGetFunction,
	aos: createAoSGetFunction,
};
