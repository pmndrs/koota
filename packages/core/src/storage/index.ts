export { createStore } from './stores';
export {
    createSetFunction,
    createFastSetFunction,
    createFastSetChangeFunction,
    createGetFunction,
} from './accessors';

export {
    field,
    validateDefinition,
    getSchemaDefaults,
    parseDefinition,
    parseField,
    detectKind,
    isFieldDescriptor,
    /** @deprecated Use isFieldDescriptor instead */
    isFieldDescriptor as isSchemaEntry,
    /** @deprecated Use isFieldDescriptor instead */
    isFieldDescriptor as isFieldSchema,
} from './schema';

export { $fieldDescriptor } from './types';
/** @deprecated Use $fieldDescriptor instead */
export { $schemaEntry } from './types';

export type {
    Store,
    StoreType,
    Definition,
    DefinitionFor,
    DefinitionValue,
    AoSFactory,
    Norm,
    InferDefinition,
    SchemaKind,
    FieldDescriptor,
    Schema,
    /** @deprecated Use FieldDescriptor instead */
    SchemaEntry,
    /** @deprecated Use FieldDescriptor instead */
    FieldSchema,
} from './types';
