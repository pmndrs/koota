import type { Definition } from './types';

function createSoASetFunction(definition: Definition) {
    const keys = Object.keys(definition);

    // Generate a hardcoded set function based on the definition keys
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

function createSoAFastSetFunction(definition: Definition) {
    const keys = Object.keys(definition);

    // Generate a hardcoded set function based on the definition keys
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
function createSoAFastSetChangeFunction(definition: Definition) {
    const keys = Object.keys(definition);

    // Generate a hardcoded set function based on the definition keys
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

function createSoAGetFunction(definition: Definition) {
    const keys = Object.keys(definition);

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

function createAoSSetFunction(_definition: Definition) {
    return (index: number, store: any, value: any) => {
        store[index] = value;
    };
}

function createAoSFastSetChangeFunction(_definition: Definition) {
    return (index: number, store: any, value: any) => {
        let changed = false;
        if (value !== store[index]) {
            store[index] = value;
            changed = true;
        }
        return changed;
    };
}

function createAoSGetFunction(_definition: Definition) {
    return (index: number, store: any) => store[index];
}

const noop = () => {};
const createTagNoop = () => noop;

export const createSetFunction = {
    soa: createSoASetFunction,
    aos: createAoSSetFunction,
    tag: createTagNoop,
};

export const createFastSetFunction = {
    soa: createSoAFastSetFunction,
    aos: createAoSSetFunction,
    tag: createTagNoop,
};

export const createFastSetChangeFunction = {
    soa: createSoAFastSetChangeFunction,
    aos: createAoSFastSetChangeFunction,
    tag: createTagNoop,
};

export const createGetFunction = {
    soa: createSoAGetFunction,
    aos: createAoSGetFunction,
    tag: createTagNoop,
};
