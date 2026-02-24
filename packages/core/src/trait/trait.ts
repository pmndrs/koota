import { $internal } from '../common';
import { HiSparseBitSet } from '../utils/hi-sparse-bitset';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged } from '../query/modifiers/changed';
import type { FieldDescriptor, InferSchema, SchemaFor, SchemaShorthand, TagSchema } from '../storage';
import {
    createFastSetAccessor,
    createFastSetChangeAccessor,
    createGetAccessor,
    createGetDefaultAccessor,
    createSetAccessor,
    createStore,
    normalizeSchema,
    validateSchema,
} from '../storage';
import type { World } from '../world';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
import { getOrderedTraitRelation, isOrderedTrait, setupOrderedTraitSync } from './ordered';
import { OrderedList } from './ordered-list';
import { getTraitInstance, hasTraitInstance, setTraitInstance } from './trait-instance';
import type {
    BinaryTraitCallable,
    ExtractStore,
    OrderedRelation,
    Relation,
    Trait,
    TraitInstance,
    TraitMode,
    UnaryTraitCallable,
} from './types';

const tagDefinition = Object.freeze({});
let traitId = 0;

/** @internal */
export function defineTrait(
    schema: SchemaShorthand | FieldDescriptor = tagDefinition,
    mode: TraitMode = 'unary'
): Trait {
    let trait: Trait;

    validateSchema(schema);
    const normalizedSchema = normalizeSchema(schema);

    const set = createSetAccessor(normalizedSchema);
    const fastSet = createFastSetAccessor(normalizedSchema);
    const fastSetWithChangeDetection = createFastSetChangeAccessor(normalizedSchema);
    const get = createGetAccessor(normalizedSchema);
    const ctor = createGetDefaultAccessor(normalizedSchema);

    let callable: BinaryTraitCallable | UnaryTraitCallable;
    if (mode === 'binary') {
        callable = ((target: Entity | '*', params?: unknown) => [
            trait,
            target,
            params,
        ]) as BinaryTraitCallable;
    } else {
        callable = ((params) => [trait, params]) as UnaryTraitCallable;
    }

    trait = Object.assign(callable, {
        [$internal]: {
            mode,
            accessors: { set, fastSet, fastSetWithChangeDetection, get },
            ctor,
        },
    }) as Trait;

    Object.defineProperty(trait, 'id', {
        value: traitId++,
        writable: false,
        enumerable: true,
        configurable: false,
    });

    Object.defineProperty(trait, 'schema', {
        value: Object.freeze(normalizedSchema),
        writable: false,
        enumerable: true,
        configurable: false,
    });

    return trait;
}

/** @see {@link trait} for overload signatures */
export interface trait {
    (schema?: undefined | Record<string, never>): Trait<Record<string, never>, 'unary'> & {
        readonly schema: TagSchema;
    };
    <T>(schema: () => T): Trait<T, 'unary'>;
    <T>(schema: FieldDescriptor<T> & { kind: 'ref' }): Trait<T, 'unary'>;
    <T>(schema: SchemaFor<T>): Trait<T, 'unary'>;
    <D extends SchemaShorthand>(schema: D): Trait<InferSchema<D>, 'unary'>;
}

export const trait: trait = defineTrait as trait;

export function registerTrait(world: World, trait: Trait) {
    const ctx = world[$internal];
    const { mode, accessors, ctor } = trait[$internal];

    const data: TraitInstance = {
        generationId: ctx.entityMasks.length - 1,
        bitflag: ctx.bitflag,
        bitSet: new HiSparseBitSet(),
        definition: trait,
        store: createStore(trait.schema) as TraitInstance['store'],
        mode,
        accessors,
        ctor,
        queries: new Set(),
        trackingQueries: new Set(),
        notQueries: new Set(),
        relationQueries: new Set(),
        changeSubscriptions: new Set(),
        addSubscriptions: new Set(),
        removeSubscriptions: new Set(),
    };

    if (mode === 'binary') {
        data.pairStore = createStore(trait.schema) as TraitInstance['pairStore'];
        data.slotMap = [];
        data.nextSlot = 0;
        data.freeSlots = [];
        data.targetPairIds = [];
    }

    setTraitInstance(ctx.traitInstances, trait, data);
    world.traits.add(trait);

    if (mode === 'binary') ctx.relations.add(trait as Relation);

    incrementWorldBitflag(world);

    if (isOrderedTrait(trait)) setupOrderedTraitSync(world, trait);
}

function getOrderedTrait(world: World, entity: Entity, trait: OrderedRelation): OrderedList {
    const relation = getOrderedTraitRelation(trait);
    return new OrderedList(world, entity, relation, trait);
}

// =============================================================================
// Unary trait operations — no isPair, no relation imports
// =============================================================================

export function addTrait(world: World, entity: Entity, trait: Trait, params?: Record<string, any>) {
    const instance = addTraitToEntity(world, entity, trait);
    if (!instance) return;

    const defaults = isOrderedTrait(trait) ? getOrderedTrait(world, entity, trait) : instance.ctor();

    if (trait.schema.kind === 'aos') {
        if (params ?? defaults)
            instance.accessors.set(getEntityId(entity), instance.store, params ?? defaults);
    } else if (defaults) {
        instance.accessors.set(getEntityId(entity), instance.store, { ...defaults, ...params });
    } else if (params) {
        instance.accessors.set(getEntityId(entity), instance.store, params);
    }

    for (const sub of instance.addSubscriptions) sub(entity);
}

export function removeTrait(world: World, entity: Entity, trait: Trait) {
    if (!hasTrait(world, entity, trait)) return;
    const instance = getTraitInstance(world[$internal].traitInstances, trait)!;
    for (const sub of instance.removeSubscriptions) sub(entity);
    removeTraitFromEntity(world, entity, trait);
}

/** Bitmask-only membership check. */
export /* @inline @pure */ function hasTrait(world: World, entity: Entity, trait: Trait): boolean {
    const ctx = world[$internal];
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (!instance) return false;

    const { generationId, bitflag } = instance;
    const eid = getEntityId(entity);
    const mask = ctx.entityMasks[generationId][eid];

    return (mask & bitflag) === bitflag;
}

export function setTrait(
    world: World,
    entity: Entity,
    trait: Trait,
    value: any,
    triggerChanged = true
) {
    const instance = getTraitInstance(world[$internal].traitInstances, trait)!;
    const index = getEntityId(entity);
    const store = instance.store;

    value instanceof Function && (value = value(instance.accessors.get(index, store)));
    instance.accessors.set(index, store, value);
    if (triggerChanged) setChanged(world, entity, trait);
}

export function getTrait(world: World, entity: Entity, trait: Trait) {
    if (!hasTrait(world, entity, trait)) return undefined;
    const instance = getTraitInstance(world[$internal].traitInstances, trait)!;
    return instance.accessors.get(getEntityId(entity), instance.store);
}

export /* @inline @pure */ function getStore<C extends Trait = Trait>(
    world: World,
    trait: C
): ExtractStore<C> {
    const ctx = world[$internal];
    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    return instance.store as ExtractStore<C>;
}

// =============================================================================
// Core bitmask operations — exported for relation.ts to use
// =============================================================================

export function addTraitToEntity(
    world: World,
    entity: Entity,
    trait: Trait
): TraitInstance | undefined {
    if (hasTrait(world, entity, trait)) return undefined;

    const ctx = world[$internal];

    if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(world, trait);

    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    const { generationId, bitflag, queries, trackingQueries } = instance;

    const eid = getEntityId(entity);
    ctx.entityMasks[generationId][eid] |= bitflag;
    instance.bitSet.insert(eid);

    for (const dirtyMask of ctx.dirtyMasks.values()) {
        if (!dirtyMask[generationId]) dirtyMask[generationId] = [];
        dirtyMask[generationId][eid] |= bitflag;
    }

    for (const query of queries) {
        query.toRemove.remove(entity);
        const match = query.check(world, entity);
        if (match) query.add(entity);
        else query.remove(world, entity);
    }

    for (const query of trackingQueries) {
        query.toRemove.remove(entity);
        const match = query.checkTracking(world, entity, 'add', trait);
        if (match) query.add(entity);
        else query.remove(world, entity);
    }

    ctx.entityTraits.get(entity)!.add(trait);

    return instance;
}

export function removeTraitFromEntity(world: World, entity: Entity, trait: Trait): void {
    if (!hasTrait(world, entity, trait)) return;

    const ctx = world[$internal];
    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    const { generationId, bitflag, queries, trackingQueries } = instance;

    const eid = getEntityId(entity);
    ctx.entityMasks[generationId][eid] &= ~bitflag;
    instance.bitSet.remove(eid);

    for (const dirtyMask of ctx.dirtyMasks.values()) {
        dirtyMask[generationId][eid] |= bitflag;
    }

    for (const query of queries) {
        const match = query.check(world, entity);
        if (match) query.add(entity);
        else query.remove(world, entity);
    }

    for (const query of trackingQueries) {
        const match = query.checkTracking(world, entity, 'remove', trait);
        if (match) query.add(entity);
        else query.remove(world, entity);
    }

    ctx.entityTraits.get(entity)!.delete(trait);
}
