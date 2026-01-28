/**
 * @file layout.ts
 * @description Multi-trait interleaved layout implementation
 *
 * A layout combines multiple traits into a single interleaved buffer:
 *
 *   const InstanceData = layout({
 *     position: { x: Float32Array, y: Float32Array, z: Float32Array },
 *     rotation: Float32Array,
 *     scale: { x: Float32Array, y: Float32Array },
 *   })
 *
 * Memory: [px,py,pz,rot,sx,sy, px,py,pz,rot,sx,sy, ...]
 *          └──── entity 0 ────┘ └──── entity 1 ────┘
 */

import { $internal } from '../common';
import type { Trait, TraitInstance } from '../trait/types';
import {
    type EntityMapping,
    type FieldGroup,
    type FieldGroupRecord,
    type FieldGroupStore,
    type GrowthPolicy,
    type Layout,
    type LayoutMetadata,
    type LayoutOptions,
    type LayoutSchema,
    type LayoutStore,
    type LayoutTrait,
    type LayoutTraits,
    type SchemaEntry,
    type SchemaEntryRecord,
    type SingleField,
    type TraitLayoutInfo,
    type TypedArrayConstructor,
    LAYOUT_SYMBOL,
    getBytesPerElement,
    isFieldGroup,
    isTypedArrayConstructor,
} from './types';

let layoutTraitId = 1000000; // Start high to avoid conflicts with regular traits

/**
 * Creates a multi-trait interleaved layout.
 *
 * @example
 * ```ts
 * const InstanceData = layout({
 *   position: { x: Float32Array, y: Float32Array, z: Float32Array },
 *   rotation: Float32Array,
 *   scale: { x: Float32Array, y: Float32Array },
 * }, {
 *   capacity: 10_000,
 *   growth: 'fixed',
 * })
 *
 * // Extract traits for ECS usage
 * const { position, rotation, scale } = InstanceData.traits
 *
 * // Spawn entities
 * world.spawn(
 *   position({ x: 100, y: 200, z: 0 }),
 *   rotation(Math.PI / 4),
 * )
 *
 * // Direct buffer access for GPU upload
 * device.queue.writeBuffer(gpuBuffer, 0, InstanceData.buffer)
 * ```
 */
export function layout<S extends LayoutSchema>(schema: S, options: LayoutOptions): Layout<S> {
    const { capacity, growth = 'fixed', buffer: externalBuffer, alignment = 4 } = options;

    if (capacity <= 0) {
        throw new Error('Layout capacity must be positive');
    }

    // Validate schema and calculate layout
    const metadata = calculateLayoutMetadata(schema, alignment);

    // Allocate or use external buffer
    const requiredSize = metadata.stride * capacity;
    let buffer: ArrayBuffer;

    if (externalBuffer) {
        if (externalBuffer.byteLength < requiredSize) {
            throw new Error(
                `External buffer too small. Required: ${requiredSize}, Got: ${externalBuffer.byteLength}`
            );
        }
        buffer = externalBuffer as ArrayBuffer;
    } else {
        buffer = new ArrayBuffer(requiredSize);
    }

    // Create entity mapping for dense packing
    const entityMapping: EntityMapping = {
        entityToIndex: new Map(),
        indexToEntity: [],
        count: 0,
    };

    // Create store with strided TypedArray views
    const store = createLayoutStore(schema, metadata, buffer, capacity);

    // Create extracted traits
    const traits = createLayoutTraits(schema, metadata);

    // Build the layout object
    const layoutInstance: Layout<S> = {
        [LAYOUT_SYMBOL]: true,
        schema,
        traits: traits as LayoutTraits<S>,
        buffer,
        store: store as LayoutStore<S>,
        metadata,
        stride: metadata.stride,
        growth,

        get count() {
            return entityMapping.count;
        },

        get capacity() {
            return capacity;
        },

        indexOf(entityId: number): number {
            return entityMapping.entityToIndex.get(entityId) ?? -1;
        },

        entityAt(bufferIndex: number): number {
            return entityMapping.indexToEntity[bufferIndex] ?? -1;
        },

        has(entityId: number): boolean {
            return entityMapping.entityToIndex.has(entityId);
        },

        _addEntity(entityId: number): number {
            // Check if already in layout
            if (entityMapping.entityToIndex.has(entityId)) {
                return entityMapping.entityToIndex.get(entityId)!;
            }

            // Check capacity
            if (entityMapping.count >= capacity) {
                if (growth === 'fixed' || growth === 'none') {
                    throw new Error(`Layout capacity exceeded: ${capacity}`);
                }
                if (growth === 'ring') {
                    // TODO: Implement ring buffer - for now, throw
                    throw new Error('Ring buffer growth not yet implemented');
                }
                // growth === 'double' - would need to reallocate
                throw new Error('Dynamic growth not yet implemented for layouts');
            }

            // Assign next available index
            const index = entityMapping.count;
            entityMapping.entityToIndex.set(entityId, index);
            entityMapping.indexToEntity[index] = entityId;
            entityMapping.count++;

            return index;
        },

        _removeEntity(entityId: number): void {
            const index = entityMapping.entityToIndex.get(entityId);
            if (index === undefined) return;

            const lastIndex = entityMapping.count - 1;

            if (index !== lastIndex) {
                // Swap-remove: copy last entity's data to this slot
                const lastEntityId = entityMapping.indexToEntity[lastIndex];

                // Copy data
                const srcOffset = lastIndex * metadata.stride;
                const dstOffset = index * metadata.stride;
                const bytes = new Uint8Array(buffer);
                bytes.copyWithin(dstOffset, srcOffset, srcOffset + metadata.stride);

                // Update mapping for moved entity
                entityMapping.entityToIndex.set(lastEntityId, index);
                entityMapping.indexToEntity[index] = lastEntityId;
            }

            // Remove the entity
            entityMapping.entityToIndex.delete(entityId);
            entityMapping.indexToEntity.pop();
            entityMapping.count--;
        },

        _setValues<K extends keyof S>(
            entityId: number,
            traitName: K,
            values: SchemaEntryRecord<S[K]>
        ): void {
            const index = entityMapping.entityToIndex.get(entityId);
            if (index === undefined) {
                throw new Error(`Entity ${entityId} not in layout`);
            }

            const traitStore = store[traitName];
            const schemaEntry = schema[traitName];

            if (isFieldGroup(schemaEntry)) {
                // Field group - set each field
                const fieldGroupStore = traitStore as FieldGroupStore<FieldGroup>;
                const fieldGroupValues = values as FieldGroupRecord<FieldGroup>;
                for (const [field, value] of Object.entries(fieldGroupValues)) {
                    if (field in fieldGroupStore && value !== undefined) {
                        (fieldGroupStore as any)[field][index] = value;
                    }
                }
            } else {
                // Single field
                (traitStore as any)[index] = values;
            }
        },

        _getValues<K extends keyof S>(entityId: number, traitName: K): SchemaEntryRecord<S[K]> {
            const index = entityMapping.entityToIndex.get(entityId);
            if (index === undefined) {
                throw new Error(`Entity ${entityId} not in layout`);
            }

            const traitStore = store[traitName];
            const schemaEntry = schema[traitName];

            if (isFieldGroup(schemaEntry)) {
                // Field group - get each field
                const fieldGroupStore = traitStore as FieldGroupStore<FieldGroup>;
                const record = {} as FieldGroupRecord<FieldGroup>;
                for (const field of Object.keys(schemaEntry)) {
                    record[field] = (fieldGroupStore as any)[field][index];
                }
                return record as SchemaEntryRecord<S[K]>;
            } else {
                // Single field
                return (traitStore as any)[index] as SchemaEntryRecord<S[K]>;
            }
        },
    };

    // Link traits back to layout
    for (const traitName of Object.keys(traits)) {
        (traits as any)[traitName]._layout = layoutInstance;
    }

    return layoutInstance;
}

/**
 * Calculates the complete layout metadata from a schema
 */
function calculateLayoutMetadata<S extends LayoutSchema>(
    schema: S,
    alignment: number
): LayoutMetadata<S> {
    const traitNames = Object.keys(schema) as (keyof S)[];
    const traitOffsets = {} as { [K in keyof S]: number };
    const traitInfo = {} as { [K in keyof S]: TraitLayoutInfo };
    const flatFields: LayoutMetadata<S>['flatFields'] = [];

    let currentOffset = 0;

    for (const traitName of traitNames) {
        const entry = schema[traitName];
        const info: TraitLayoutInfo = {
            byteOffset: currentOffset,
            byteSize: 0,
            fields: new Map(),
        };

        traitOffsets[traitName] = currentOffset;

        if (isFieldGroup(entry)) {
            // Field group - multiple fields
            const fieldGroup = entry as FieldGroup;
            let fieldOffset = 0;

            for (const [fieldName, fieldType] of Object.entries(fieldGroup)) {
                if (!isTypedArrayConstructor(fieldType)) {
                    throw new Error(
                        `Field "${String(traitName)}.${fieldName}" must be a TypedArray constructor`
                    );
                }

                const byteSize = getBytesPerElement(fieldType);

                info.fields.set(fieldName, {
                    byteOffset: fieldOffset,
                    byteSize,
                    type: fieldType,
                });

                flatFields.push({
                    traitName,
                    fieldName,
                    byteOffset: currentOffset + fieldOffset,
                    byteSize,
                    type: fieldType,
                });

                fieldOffset += byteSize;
            }

            info.byteSize = fieldOffset;
            currentOffset += fieldOffset;
        } else {
            // Single field
            if (!isTypedArrayConstructor(entry)) {
                throw new Error(`Trait "${String(traitName)}" must be a TypedArray constructor`);
            }

            const byteSize = getBytesPerElement(entry as TypedArrayConstructor);
            info.byteSize = byteSize;

            flatFields.push({
                traitName,
                fieldName: null,
                byteOffset: currentOffset,
                byteSize,
                type: entry as TypedArrayConstructor,
            });

            currentOffset += byteSize;
        }

        traitInfo[traitName] = info;
    }

    // Apply alignment padding if needed
    const stride = Math.ceil(currentOffset / alignment) * alignment;

    return {
        schema,
        stride,
        traitOffsets,
        traitInfo,
        flatFields,
    };
}

/**
 * Creates the store object with strided TypedArray proxies
 */
function createLayoutStore<S extends LayoutSchema>(
    schema: S,
    metadata: LayoutMetadata<S>,
    buffer: ArrayBuffer,
    capacity: number
): LayoutStore<S> {
    const store = {} as LayoutStore<S>;
    const { stride, traitInfo } = metadata;

    for (const traitName of Object.keys(schema) as (keyof S)[]) {
        const entry = schema[traitName];
        const info = traitInfo[traitName];

        if (isFieldGroup(entry)) {
            // Field group - create nested store
            const fieldGroupStore = {} as FieldGroupStore<FieldGroup>;

            for (const [fieldName, fieldType] of Object.entries(entry)) {
                const fieldInfo = info.fields.get(fieldName)!;
                const absoluteOffset = info.byteOffset + fieldInfo.byteOffset;

                fieldGroupStore[fieldName] = createStridedArrayProxy(
                    fieldType,
                    buffer,
                    absoluteOffset,
                    stride,
                    capacity
                );
            }

            store[traitName] = fieldGroupStore as LayoutStore<S>[keyof S];
        } else {
            // Single field
            store[traitName] = createStridedArrayProxy(
                entry as TypedArrayConstructor,
                buffer,
                info.byteOffset,
                stride,
                capacity
            ) as LayoutStore<S>[keyof S];
        }
    }

    return store;
}

/**
 * Creates a strided TypedArray proxy for accessing interleaved data
 */
function createStridedArrayProxy(
    ArrayCtor: TypedArrayConstructor,
    buffer: ArrayBuffer,
    byteOffset: number,
    stride: number,
    capacity: number
): any {
    const view = new DataView(buffer);
    const bytesPerElement = getBytesPerElement(ArrayCtor);
    const { read, write } = getDataViewMethods(ArrayCtor);

    return new Proxy([] as number[], {
        get(target, prop) {
            if (prop === 'length') return capacity;
            if (prop === 'buffer') return buffer;
            if (prop === 'byteOffset') return byteOffset;
            if (prop === 'stride') return stride;
            if (prop === 'BYTES_PER_ELEMENT') return bytesPerElement;

            if (prop === Symbol.iterator) {
                return function* () {
                    for (let i = 0; i < capacity; i++) {
                        yield read(view, byteOffset + i * stride);
                    }
                };
            }

            if (prop === 'forEach') {
                return (callback: (value: number | bigint, index: number) => void) => {
                    for (let i = 0; i < capacity; i++) {
                        callback(read(view, byteOffset + i * stride), i);
                    }
                };
            }

            if (prop === 'fill') {
                return (value: number | bigint, start = 0, end = capacity) => {
                    for (let i = start; i < end; i++) {
                        write(view, byteOffset + i * stride, value);
                    }
                };
            }

            // Numeric index
            if (typeof prop === 'string' && !isNaN(Number(prop))) {
                const index = Number(prop);
                if (index >= 0 && index < capacity) {
                    return read(view, byteOffset + index * stride);
                }
            }

            return undefined;
        },

        set(target, prop, value) {
            if (typeof prop === 'string' && !isNaN(Number(prop))) {
                const index = Number(prop);
                if (index >= 0 && index < capacity) {
                    write(view, byteOffset + index * stride, value);
                    return true;
                }
            }
            return false;
        },
    });
}

function getDataViewMethods(ArrayCtor: TypedArrayConstructor): {
    read: (view: DataView, offset: number) => number | bigint;
    write: (view: DataView, offset: number, value: number | bigint) => void;
} {
    const littleEndian = true;

    switch (ArrayCtor) {
        case Float32Array:
            return {
                read: (v, o) => v.getFloat32(o, littleEndian),
                write: (v, o, val) => v.setFloat32(o, val as number, littleEndian),
            };
        case Float64Array:
            return {
                read: (v, o) => v.getFloat64(o, littleEndian),
                write: (v, o, val) => v.setFloat64(o, val as number, littleEndian),
            };
        case Int8Array:
            return {
                read: (v, o) => v.getInt8(o),
                write: (v, o, val) => v.setInt8(o, val as number),
            };
        case Int16Array:
            return {
                read: (v, o) => v.getInt16(o, littleEndian),
                write: (v, o, val) => v.setInt16(o, val as number, littleEndian),
            };
        case Int32Array:
            return {
                read: (v, o) => v.getInt32(o, littleEndian),
                write: (v, o, val) => v.setInt32(o, val as number, littleEndian),
            };
        case BigInt64Array:
            return {
                read: (v, o) => v.getBigInt64(o, littleEndian),
                write: (v, o, val) => v.setBigInt64(o, val as bigint, littleEndian),
            };
        case Uint8Array:
            return {
                read: (v, o) => v.getUint8(o),
                write: (v, o, val) => v.setUint8(o, val as number),
            };
        case Uint8ClampedArray:
            return {
                read: (v, o) => v.getUint8(o),
                write: (v, o, val) => v.setUint8(o, Math.max(0, Math.min(255, val as number))),
            };
        case Uint16Array:
            return {
                read: (v, o) => v.getUint16(o, littleEndian),
                write: (v, o, val) => v.setUint16(o, val as number, littleEndian),
            };
        case Uint32Array:
            return {
                read: (v, o) => v.getUint32(o, littleEndian),
                write: (v, o, val) => v.setUint32(o, val as number, littleEndian),
            };
        case BigUint64Array:
            return {
                read: (v, o) => v.getBigUint64(o, littleEndian),
                write: (v, o, val) => v.setBigUint64(o, val as bigint, littleEndian),
            };
        default:
            throw new Error(`Unsupported TypedArray type`);
    }
}

/**
 * Creates extracted traits from layout schema
 *
 * KOOTA INTEGRATION STATUS: These traits are NOT yet compatible with koota's
 * world/entity system. They are callable and have id/schema properties, but
 * lack the $internal property required for registerTrait().
 *
 * TO INTEGRATE WITH KOOTA, each trait needs:
 * ```typescript
 * trait[$internal] = {
 *   id: trait.id,
 *   get: (index, store) => layout._getValues(entityAt(index), traitName),
 *   set: (index, store, value) => layout._setValues(entityAt(index), traitName, value),
 *   fastSet: ...,
 *   fastSetWithChangeDetection: ...,
 *   createStore: () => layout.store[traitName],
 *   relation: null,
 *   type: 'interleaved',
 * }
 * ```
 *
 * The challenge is that layout storage is shared across traits and uses
 * dense entity mapping, which differs from koota's sparse entity ID indexing.
 */
function createLayoutTraits<S extends LayoutSchema>(
    schema: S,
    metadata: LayoutMetadata<S>
): LayoutTraits<S> {
    const traits = {} as LayoutTraits<S>;

    for (const traitName of Object.keys(schema) as (keyof S)[]) {
        const entry = schema[traitName];
        const id = layoutTraitId++;

        // Create the trait function
        const trait = ((params?: Partial<SchemaEntryRecord<typeof entry>>) => {
            return [trait, params ?? {}];
        }) as LayoutTrait<typeof entry>;

        // Attach properties
        Object.defineProperties(trait, {
            id: { value: id, writable: false, enumerable: true },
            schema: { value: entry, writable: false, enumerable: true },
            _layout: { value: null, writable: true }, // Set later
            _traitName: { value: traitName, writable: false },
        });

        traits[traitName] = trait as LayoutTraits<S>[keyof S];
    }

    return traits;
}

/**
 * Check if a value is a layout
 */
export function isLayout<S extends LayoutSchema>(value: unknown): value is Layout<S> {
    return typeof value === 'object' && value !== null && (value as any)[LAYOUT_SYMBOL] === true;
}

/**
 * Check if a trait is backed by a layout
 */
export function isLayoutTrait(trait: unknown): trait is LayoutTrait<any> {
    return typeof trait === 'function' && '_layout' in trait && '_traitName' in trait;
}

/**
 * Gets the layout that backs a trait, if any
 */
export function getTraitLayout(trait: unknown): Layout<any> | null {
    if (isLayoutTrait(trait)) {
        return trait._layout;
    }
    return null;
}
