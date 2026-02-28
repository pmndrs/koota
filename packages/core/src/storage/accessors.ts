import type { Schema, SoASchema } from './types';
import { BLOCK_SHIFT, BLOCK_SIZE, BLOCK_MASK } from './stores';

/**
 * generates optimized get/set functions for trait stores at trait creation time.
 * uses `new Function` to compile away property lookups so hot loops stay fast.
 *
 * block-aligned variant: data lives in blocks of 1024 entries matching the bitset layout.
 * access pattern: store.key[index >>> 10][index & 1023]
 */

//  SoA default value constructors

function inlinePrimitive(value: unknown): string | null {
    switch (typeof value) {
        case 'number':
        case 'boolean':
            return String(value);
        case 'string':
            return JSON.stringify(value);
        case 'bigint':
            return `${value}n`;
        default:
            return null;
    }
}

function createSoAGetDefaultFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);
    const closureArgs: string[] = [];
    const closureValues: any[] = [];

    const fields = keys
        .filter((key) => schema.fields[key].default !== undefined)
        .map((key) => {
            const def = schema.fields[key].default;
            if (typeof def === 'function') {
                const argName = `def_${key}`;
                closureArgs.push(argName);
                closureValues.push(def);
                return `${key}: ${argName}()`;
            }
            const inlined = inlinePrimitive(def);
            if (inlined !== null) return `${key}: ${inlined}`;
            const argName = `def_${key}`;
            closureArgs.push(argName);
            closureValues.push(def);
            return `${key}: ${argName}`;
        });

    if (fields.length === 0) return () => ({});

    const innerBody = `return { ${fields.join(', ')} };`;
    if (closureArgs.length === 0) return new Function(innerBody);
    const outerBody = `return function getDefault() { ${innerBody} };`;
    return new Function(...closureArgs, outerBody)(...closureValues);
}

// SoA accessors
function createSoASetFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    // generate block-ensure + write code for each field
    const body = [
        `var bi = index >>> ${BLOCK_SHIFT};`,
        `var off = index & ${BLOCK_MASK};`,
        ...keys.map(
            (key) =>
                `if (Object.hasOwn(value, '${key}')) {\n` +
                `        if (!store.${key}[bi]) store.${key}[bi] = new Array(${BLOCK_SIZE});\n` +
                `        store.${key}[bi][off] = value.${key};\n` +
                `    }`
        ),
    ].join('\n    ');

    return new Function('index', 'store', 'value', body);
}

function createSoAFastSetFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    const body = [
        `var bi = index >>> ${BLOCK_SHIFT};`,
        `var off = index & ${BLOCK_MASK};`,
        ...keys.map((key) => `store.${key}[bi][off] = value.${key};`),
    ].join('\n    ');

    return new Function('index', 'store', 'value', body);
}

function createSoAFastSetChangeFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    const body = [
        `var bi = index >>> ${BLOCK_SHIFT};`,
        `var off = index & ${BLOCK_MASK};`,
        'var changed = false;',
        ...keys.map(
            (key) =>
                `if (store.${key}[bi][off] !== value.${key}) {\n` +
                `        store.${key}[bi][off] = value.${key};\n` +
                `        changed = true;\n` +
                `    }`
        ),
        'return changed;',
    ].join('\n    ');

    return new Function('index', 'store', 'value', body);
}

function createSoAGetFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    // cache block references per key so we only look up each block once
    // instead of twice (existence check + read)
    const blockVars = keys.map((key) => `b_${key}`);
    const body = [
        `var bi = index >>> ${BLOCK_SHIFT};`,
        `var off = index & ${BLOCK_MASK};`,
        ...keys.map((key, i) => `var ${blockVars[i]} = store.${key}[bi];`),
        `return { ${keys.map((key, i) => `${key}: ${blockVars[i]} ? ${blockVars[i]}[off] : undefined`).join(', ')} };`,
    ].join('\n    ');

    return new Function('index', 'store', body);
}

// AoS accessors: simple index-based read/write into a flat array store

const aosSet = (index: number, store: any, value: any) => {
    store[index] = value;
};

const aosFastSetChange = (index: number, store: any, value: any) => {
    if (value !== store[index]) {
        store[index] = value;
        return true;
    }
    return false;
};

const aosGet = (index: number, store: any) => store[index];

// Tag accessor: tags carry no data so all operations are no-ops

const noop = () => {};

export function createSetAccessor(schema: Schema) {
    switch (schema.kind) {
        case 'soa':
            return createSoASetFunction(schema);
        case 'aos':
            return aosSet;
        case 'tag':
            return noop;
    }
}

export function createFastSetAccessor(schema: Schema) {
    switch (schema.kind) {
        case 'soa':
            return createSoAFastSetFunction(schema);
        case 'aos':
            return aosSet;
        case 'tag':
            return noop;
    }
}

export function createFastSetChangeAccessor(schema: Schema) {
    switch (schema.kind) {
        case 'soa':
            return createSoAFastSetChangeFunction(schema);
        case 'aos':
            return aosFastSetChange;
        case 'tag':
            return noop;
    }
}

export function createGetAccessor(schema: Schema) {
    switch (schema.kind) {
        case 'soa':
            return createSoAGetFunction(schema);
        case 'aos':
            return aosGet;
        case 'tag':
            return noop;
    }
}

export function createGetDefaultAccessor(schema: Schema): () => Record<string, any> | null {
    switch (schema.kind) {
        case 'tag':
            return () => null;
        case 'aos': {
            const def = schema.descriptor.default;
            return typeof def === 'function' ? (def as () => Record<string, any>) : () => null;
        }
        case 'soa':
            return createSoAGetDefaultFunction(schema);
    }
}
