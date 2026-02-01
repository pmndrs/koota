export { createStore } from './stores';
export {
    createSetFunction,
    createFastSetFunction,
    createFastSetChangeFunction,
    createGetFunction,
} from './accessors';

export {
    validateSchema,
    getSchemaDefaults,
    normalizeSchema,
} from './schema';

export type {
    Store,
    StoreType,
    Schema,
    AoSFactory,
    Norm,
    FieldDescriptor,
    ExpandedSchema,
    TraitDescriptor,
    FieldType,
    ScalarFieldType,
    ReferenceFieldType,
} from './types';
