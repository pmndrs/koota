import type { Schema, SoASchema } from './types';

/**
 * Indirection is the killer of hot loops. We optimize for this by compiling away indirection
 * for accessors at runtime using `new Function` to generate bytecode when a trait is created.
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

    const body = keys
        .map((key) => `if (Object.hasOwn(value, '${key}')) store.${key}[index] = value.${key};`)
        .join('\n    ');

    return new Function('index', 'store', 'value', body);
}

function createSoAFastSetFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    const body = keys.map((key) => `store.${key}[index] = value.${key};`).join('\n    ');

    return new Function('index', 'store', 'value', body);
}

function createSoAFastSetChangeFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    const body = keys
        .map(
            (key) =>
                `if (store.${key}[index] !== value.${key}) {
            store.${key}[index] = value.${key};
            changed = true;
        }`
        )
        .join('\n    ');

    return new Function(
        'index',
        'store',
        'value',
        `let changed = false;\n    ${body}\n    return changed;`
    );
}

function createSoAGetFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    const objectLiteral = `{ ${keys.map((key) => `${key}: store.${key}[index]`).join(', ')} }`;

    return new Function('index', 'store', `return ${objectLiteral};`);
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

// Pair accessors: 2D storage for binary (relation) traits
// SoA pair: store.field[eid][targetIndex], AoS pair: store[eid][targetIndex]

function createSoAPairSetFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    const body = keys
        .map(
            (key) =>
                `if (Object.hasOwn(value, '${key}')) (store.${key}[eid] || (store.${key}[eid] = []))[targetIndex] = value.${key};`
        )
        .join('\n    ');

    return new Function('eid', 'targetIndex', 'store', 'value', body);
}

function createSoAPairGetFunction(schema: SoASchema) {
    const keys = Object.keys(schema.fields);

    const fields = keys.map((key) => `${key}: store.${key}[eid]?.[targetIndex]`).join(', ');

    return new Function('eid', 'targetIndex', 'store', `return { ${fields} };`);
}

const aosPairSet = (eid: number, targetIndex: number, store: any, value: any) => {
    (store[eid] || (store[eid] = []))[targetIndex] = value;
};

const aosPairGet = (eid: number, targetIndex: number, store: any) => store[eid]?.[targetIndex];

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

export function createPairSetAccessor(schema: Schema) {
    switch (schema.kind) {
        case 'soa':
            return createSoAPairSetFunction(schema);
        case 'aos':
            return aosPairSet;
        case 'tag':
            return noop;
    }
}

export function createPairGetAccessor(schema: Schema) {
    switch (schema.kind) {
        case 'soa':
            return createSoAPairGetFunction(schema);
        case 'aos':
            return aosPairGet;
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
