import type { Schema } from './types';

function createSoASetFunction(schema: Schema) {
    const keys = Object.keys(schema);

    const setFunctionBody = keys
        .map(
            (key) =>
                `if ('${key}' in value) { if (!store.${key}[p]) store.${key}[p] = []; store.${key}[p][o] = value.${key}; }`
        )
        .join('\n    ');

    const set = new Function(
        'index',
        'store',
        'value',
        `
        var p = index >>> 10, o = index & 1023;
        ${setFunctionBody}
        `
    );

    return set;
}

function createSoAFastSetFunction(schema: Schema) {
    const keys = Object.keys(schema);

    const setFunctionBody = keys
        .map(
            (key) =>
                `if (!store.${key}[p]) store.${key}[p] = []; store.${key}[p][o] = value.${key};`
        )
        .join('\n    ');

    const set = new Function(
        'index',
        'store',
        'value',
        `
        var p = index >>> 10, o = index & 1023;
        ${setFunctionBody}
        `
    );

    return set;
}

function createSoAFastSetChangeFunction(schema: Schema) {
    const keys = Object.keys(schema);

    const setFunctionBody = keys
        .map(
            (key) =>
                `if (!store.${key}[p]) store.${key}[p] = [];
        if (store.${key}[p][o] !== value.${key}) { store.${key}[p][o] = value.${key}; changed = true; }`
        )
        .join('\n    ');

    const set = new Function(
        'index',
        'store',
        'value',
        `
        var p = index >>> 10, o = index & 1023;
        var changed = false;
        ${setFunctionBody}
        return changed;
        `
    );

    return set;
}

function createSoAGetFunction(schema: Schema) {
    const keys = Object.keys(schema);

    const objectLiteral = `{ ${keys.map((key) => `${key}: store.${key}[p][o]`).join(', ')} }`;

    const get = new Function(
        'index',
        'store',
        `
        var p = index >>> 10, o = index & 1023;
        return ${objectLiteral};
        `
    );

    return get;
}

function createAoSSetFunction(_schema: Schema) {
    return (index: number, store: any, value: any) => {
        const p = index >>> 10;
        if (!store[p]) store[p] = [];
        store[p][index & 1023] = value;
    };
}

function createAoSFastSetChangeFunction(_schema: Schema) {
    return (index: number, store: any, value: any) => {
        const p = index >>> 10, o = index & 1023;
        if (!store[p]) store[p] = [];
        let changed = false;
        if (value !== store[p][o]) {
            store[p][o] = value;
            changed = true;
        }
        return changed;
    };
}

function createAoSGetFunction(_schema: Schema) {
    return (index: number, store: any) => {
        const page = store[index >>> 10];
        return page ? page[index & 1023] : undefined;
    };
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
