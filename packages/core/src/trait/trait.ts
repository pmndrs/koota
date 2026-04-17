import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { setChanged, setPairChanged } from '../query/modifiers/changed';
import { checkQueryTrackingWithRelations } from '../query/utils/check-query-tracking-with-relations';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { getOrderedTraitRelation, isOrderedTrait, setupOrderedTraitSync } from '../relation/ordered';
import { OrderedList } from '../relation/ordered-list';
import {
    addRelationTarget,
    getFirstRelationTarget,
    getRelationData,
    getRelationTargets,
    hasRelationPair,
    hasRelationToTarget,
    removeAllRelationTargets,
    removeRelationTarget,
    setRelationData,
    setRelationDataAtIndex,
} from '../relation/relation';
import type { OrderedRelation, Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { ensureMaskPage } from '../entity/utils/paged-mask';
import {
    createFastSetChangeFunction,
    createFastSetFunction,
    createGetFunction,
    createSetFunction,
    createStore,
    getSchemaDefaults,
    Norm,
    Schema,
    StoreType,
    validateSchema,
} from '../storage';
import type { World, WorldContext } from '../world';
import { incrementWorldBitflag } from '../world/utils/increment-world-bit-flag';
import { getTraitInstance, hasTraitInstance, setTraitInstance } from './trait-instance';
import type {
    ConfigurableTrait,
    ExtractStore,
    TagTrait,
    Trait,
    TraitInstance,
    TraitValue,
} from './types';

const tagSchema = Object.freeze({});
let traitId = 0;

function createTrait(schema?: undefined | Record<string, never>): TagTrait;
function createTrait<S extends Schema>(schema: S): Trait<Norm<S>>;
function createTrait<S extends Schema>(schema: S = tagSchema as S): Trait<Norm<S>> {
    const isAoS = typeof schema === 'function';
    const isTag = !isAoS && Object.keys(schema).length === 0;
    const traitType: StoreType = isAoS ? 'aos' : isTag ? 'tag' : 'soa';

    validateSchema(schema);

    const id = traitId++;
    const Trait = Object.assign((params: TraitValue<Norm<S>>) => [Trait, params], {
        [$internal]: {
            id: id,
            set: createSetFunction[traitType](schema),
            fastSet: createFastSetFunction[traitType](schema),
            fastSetWithChangeDetection: createFastSetChangeFunction[traitType](schema),
            get: createGetFunction[traitType](schema),
            createStore: () => createStore<S>(schema),
            relation: null,
            type: traitType,
        },
    }) as Trait<Norm<S>>;

    Object.defineProperty(Trait, 'id', {
        value: id,
        writable: false,
        enumerable: true,
        configurable: false,
    });

    Object.defineProperty(Trait, 'schema', {
        value: schema,
        writable: false,
        enumerable: true,
        configurable: false,
    });

    return Trait;
}

export const trait = createTrait;

export function registerTrait(ctx: WorldContext, trait: Trait) {
    const traitCtx = trait[$internal];

    const data: TraitInstance = {
        generationId: ctx.entityMasks.length - 1,
        bitflag: ctx.bitflag,
        trait,
        store: traitCtx.createStore(),
        queries: new Set(),
        trackingQueries: new Set(),
        notQueries: new Set(),
        relationQueries: new Set(),
        schema: trait.schema,
        changeSubscriptions: new Set(),
        addSubscriptions: new Set(),
        removeSubscriptions: new Set(),
    };

    setTraitInstance(ctx.traitInstances, trait, data);
    ctx.traits.add(trait);

    if (traitCtx.relation) ctx.relations.add(traitCtx.relation);

    incrementWorldBitflag(ctx);

    if (isOrderedTrait(trait)) setupOrderedTraitSync(ctx, trait);

    if (ctx.traitRegisteredSubscriptions.size > 0) {
        for (const sub of ctx.traitRegisteredSubscriptions) sub(trait);
    }
}

function getOrderedTrait(ctx: WorldContext, entity: Entity, trait: OrderedRelation): OrderedList {
    const relation = getOrderedTraitRelation(trait);
    return new OrderedList(ctx, entity, relation, trait);
}

export function addTrait(ctx: WorldContext, entity: Entity, ...traits: ConfigurableTrait[]) {
    for (let i = 0; i < traits.length; i++) {
        const config = traits[i];

        if (isRelationPair(config)) {
            addRelationPair(ctx, entity, config);
            continue;
        }

        let trait: Trait;
        let params: Record<string, any> | undefined;

        if (Array.isArray(config)) {
            [trait, params] = config as [Trait, Record<string, any>];
        } else {
            trait = config as Trait;
        }

        const data = addTraitToEntity(ctx, entity, trait);
        if (!data) continue;

        const traitCtx = trait[$internal];

        const defaults = isOrderedTrait(trait)
            ? getOrderedTrait(ctx, entity, trait)
            : getSchemaDefaults(data.schema, traitCtx.type);

        if (traitCtx.type === 'aos') {
            setTrait(ctx, entity, trait, params ?? defaults, false);
        } else if (defaults) {
            setTrait(ctx, entity, trait, { ...defaults, ...params }, false);
        } else if (params) {
            setTrait(ctx, entity, trait, params, false);
        }

        for (const sub of data.addSubscriptions) sub(entity);
    }
}

/* @inline */ function addRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
    const relation = pair.relation;
    const target = pair.target;

    if (typeof target !== 'number') return;

    const params = pair.params;
    const relationCtx = relation[$internal];
    const relationTrait = relationCtx.trait;

    if (hasRelationToTarget(ctx, relation, entity, target)) return;

    if (relationCtx.exclusive) {
        const oldTarget = getFirstRelationTarget(ctx, relation, entity);
        if (oldTarget !== undefined && oldTarget !== target) {
            const instance = getTraitInstance(ctx.traitInstances, relationTrait);
            if (instance) {
                for (const sub of instance.removeSubscriptions) sub(entity, oldTarget);
            }
            removeRelationTarget(ctx, relation, entity, oldTarget);
        }
    }

    let instance = addTraitToEntity(ctx, entity, relationTrait);

    const targetIndex = addRelationTarget(ctx, relation, entity, target);
    if (targetIndex === -1) return;

    const schema = instance?.schema ?? getTraitInstance(ctx.traitInstances, relationTrait)!.schema;
    const defaults = getSchemaDefaults(schema, relationTrait[$internal].type);

    if (defaults) {
        setRelationDataAtIndex(ctx, entity, relation, targetIndex, { ...defaults, ...params });
    } else if (params) {
        setRelationDataAtIndex(ctx, entity, relation, targetIndex, params);
    }

    instance = instance ?? getTraitInstance(ctx.traitInstances, relationTrait)!;
    for (const sub of instance.addSubscriptions) sub(entity, target);
}

export function removeTrait(ctx: WorldContext, entity: Entity, ...traits: (Trait | RelationPair)[]) {
    for (let i = 0; i < traits.length; i++) {
        const trait = traits[i];

        if (isRelationPair(trait)) {
            removeRelationPair(ctx, entity, trait);
            continue;
        }

        if (!hasTrait(ctx, entity, trait)) continue;

        const traitCtx = trait[$internal];

        if (traitCtx.relation) {
            const instance = getTraitInstance(ctx.traitInstances, trait);
            if (instance) {
                const targets = getRelationTargets(ctx, traitCtx.relation, entity);
                for (const t of targets) {
                    for (const sub of instance.removeSubscriptions) sub(entity, t);
                }
            }
            removeAllRelationTargets(ctx, traitCtx.relation, entity);
        } else {
            const instance = getTraitInstance(ctx.traitInstances, trait);
            if (instance) {
                for (const sub of instance.removeSubscriptions) sub(entity);
            }
        }

        removeTraitFromEntity(ctx, entity, trait);
    }
}

/* @inline */ function removeRelationPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
    const relation = pair.relation;
    const target = pair.target;
    const relationTrait = relation[$internal].trait;

    if (!hasTrait(ctx, entity, relationTrait)) return;

    const instance = getTraitInstance(ctx.traitInstances, relationTrait);

    if (target === '*') {
        if (instance) {
            const targets = getRelationTargets(ctx, relation, entity);
            for (const t of targets) {
                for (const sub of instance.removeSubscriptions) sub(entity, t);
            }
        }
        removeAllRelationTargets(ctx, relation, entity);
        removeTraitFromEntity(ctx, entity, relationTrait);
        return;
    }

    if (typeof target === 'number') {
        if (instance) {
            for (const sub of instance.removeSubscriptions) sub(entity, target);
        }

        const { removedIndex, wasLastTarget } = removeRelationTarget(ctx, relation, entity, target);
        if (removedIndex === -1) return;

        if (wasLastTarget) removeTraitFromEntity(ctx, entity, relationTrait);
    }
}

export function cleanupRelationTarget(
    ctx: WorldContext,
    relation: Relation<Trait>,
    entity: Entity,
    target: Entity
): void {
    const relationTrait = relation[$internal].trait;

    const instance = getTraitInstance(ctx.traitInstances, relationTrait);
    if (instance) {
        for (const sub of instance.removeSubscriptions) sub(entity, target);
    }

    const { removedIndex, wasLastTarget } = removeRelationTarget(ctx, relation, entity, target);
    if (removedIndex === -1) return;

    if (wasLastTarget) removeTraitFromEntity(ctx, entity, relationTrait);
}

export function hasTrait(ctx: WorldContext, entity: Entity, trait: Trait): boolean {
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (!instance) return false;

    const { generationId, bitflag } = instance;
    const eid = getEntityId(entity);
    const mask = ctx.entityMasks[generationId][eid >>> 10][eid & 1023];

    return (mask & bitflag) === bitflag;
}

export /* @inline @pure */ function getStore<C extends Trait = Trait>(
    ctxOrWorld: WorldContext | World,
    trait: C
): ExtractStore<C> {
    const ctx =
        'traitInstances' in ctxOrWorld
            ? (ctxOrWorld as WorldContext)
            : (ctxOrWorld as World)[$internal];
    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    return instance.store as ExtractStore<C>;
}

export function setTrait(
    ctx: WorldContext,
    entity: Entity,
    trait: Trait | RelationPair,
    value: any,
    triggerChanged = true
) {
    if (isRelationPair(trait)) return setTraitForPair(ctx, entity, trait, value, triggerChanged);
    return setTraitForTrait(ctx, entity, trait, value, triggerChanged);
}

export function getTrait(ctx: WorldContext, entity: Entity, trait: Trait | RelationPair) {
    if (isRelationPair(trait)) return getTraitForPair(ctx, entity, trait);
    return getTraitForTrait(ctx, entity, trait);
}

/* @inline @pure */ function getTraitForPair(ctx: WorldContext, entity: Entity, pair: RelationPair) {
    const relation = pair.relation as Relation<Trait>;
    const target = pair.target;

    if (!hasRelationPair(ctx, entity, pair)) return undefined;
    if (typeof target !== 'number') return undefined;

    return getRelationData(ctx, entity, relation, target);
}

/* @inline @pure */ function getTraitForTrait(ctx: WorldContext, entity: Entity, trait: Trait) {
    if (!hasTrait(ctx, entity, trait)) return undefined;

    const traitCtx = trait[$internal];
    const store = getStore(ctx, trait);
    const data = traitCtx.get(getEntityId(entity), store);

    return data;
}

/* @inline */ function setTraitForPair(
    ctx: WorldContext,
    entity: Entity,
    pair: RelationPair,
    value: any,
    triggerChanged: boolean
) {
    const relation = pair.relation as Relation<Trait>;
    const target = pair.target;

    if (typeof target !== 'number') return;

    setRelationData(ctx, entity, relation, target, value);
    if (triggerChanged) setPairChanged(ctx, entity, relation[$internal].trait, target);
}

/* @inline */ function setTraitForTrait(
    ctx: WorldContext,
    entity: Entity,
    trait: Trait,
    value: any,
    triggerChanged: boolean
) {
    const traitCtx = trait[$internal];
    const store = getStore(ctx, trait);
    const index = getEntityId(entity);

    value instanceof Function && (value = value(traitCtx.get(index, store)));

    traitCtx.set(index, store, value);
    triggerChanged && setChanged(ctx, entity, trait);
}

/* @inline */ function addTraitToEntity(
    ctx: WorldContext,
    entity: Entity,
    trait: Trait
): TraitInstance | undefined {
    if (hasTrait(ctx, entity, trait)) return undefined;

    if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);

    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    const { generationId, bitflag, queries, trackingQueries } = instance;

    const eid = getEntityId(entity);
    const pageId = eid >>> 10;
    const offset = eid & 1023;
    ensureMaskPage(ctx.entityMasks[generationId], pageId)[offset] |= bitflag;

    for (const dirtyMask of ctx.dirtyMasks.values()) {
        ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
    }

    for (const query of queries) {
        query.toRemove.remove(entity);
        const match =
            query.relationFilters && query.relationFilters.length > 0
                ? checkQueryWithRelations(ctx, query, entity)
                : query.check(ctx, entity);
        if (match) query.add(entity);
        else query.remove(ctx, entity);
    }

    for (const query of trackingQueries) {
        query.toRemove.remove(entity);
        const match =
            query.relationFilters && query.relationFilters.length > 0
                ? checkQueryTrackingWithRelations(ctx, query, entity, 'add', generationId, bitflag)
                : query.checkTracking(ctx, entity, 'add', generationId, bitflag);
        if (match) query.add(entity);
        else query.remove(ctx, entity);
    }

    ctx.entityTraits.get(entity)!.add(trait);

    return instance;
}

function removeTraitFromEntity(ctx: WorldContext, entity: Entity, trait: Trait): void {
    if (!hasTrait(ctx, entity, trait)) return;

    const instance = getTraitInstance(ctx.traitInstances, trait)!;
    const { generationId, bitflag, queries, trackingQueries } = instance;

    const eid = getEntityId(entity);
    const pageId = eid >>> 10;
    const offset = eid & 1023;
    ctx.entityMasks[generationId][pageId][offset] &= ~bitflag;

    for (const dirtyMask of ctx.dirtyMasks.values()) {
        ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
    }

    for (const query of queries) {
        const match =
            query.relationFilters && query.relationFilters.length > 0
                ? checkQueryWithRelations(ctx, query, entity)
                : query.check(ctx, entity);
        if (match) query.add(entity);
        else query.remove(ctx, entity);
    }

    for (const query of trackingQueries) {
        const match =
            query.relationFilters && query.relationFilters.length > 0
                ? checkQueryTrackingWithRelations(ctx, query, entity, 'remove', generationId, bitflag)
                : query.checkTracking(ctx, entity, 'remove', generationId, bitflag);
        if (match) query.add(entity);
        else query.remove(ctx, entity);
    }

    ctx.entityTraits.get(entity)!.delete(trait);
}
