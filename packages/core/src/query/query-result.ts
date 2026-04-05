import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isPairPattern } from '../trait/utils/is-relation';
import { Store } from '../storage';
import { getTraitInstance } from '../trait/trait-instance';
import type { Trait, TraitAccessors, TraitInstance } from '../trait/types';
import { shallowEqual } from '../utils/shallow-equal';
import { ctz32, forEachBlockQuery, type HiSparseBitSet } from '../utils/hi-sparse-bitset';
import type { World } from '../world';
import { isModifier } from './modifier';
import { setChangedFast } from './modifiers/changed';
import type {
    InstancesFromParameters,
    QueryInstance,
    QueryParameter,
    QueryResult,
    QueryResultOptions,
    StoresFromParameters,
} from './types';

type CachedQueryContext = {
    traits: Trait[];
    stores: Store<any>[];
    instances: TraitInstance[];
    accessors: TraitAccessors[];
    isAos: boolean[];
    traitCount: number;
    methods: CachedQueryMethods;
};

type CachedQueryMethods = {
    readEach: any;
    updateEach: any;
    useStores: any;
    forEachBlock: any;
    select: any;
    sort: any;
};

const _cachedContextMap = new WeakMap<QueryInstance, CachedQueryContext>();

// sequential offsets 0..1023 for fully-populated blocks (avoids rebuilding every time)
const _seqOffsets = new Uint16Array(1024);
for (let i = 0; i < 1024; i++) _seqOffsets[i] = i;

export function createQueryResult<T extends QueryParameter[]>(
    world: World,
    entities: Entity[],
    query: QueryInstance,
    params: QueryParameter[]
): QueryResult<T> {
    let ctx = _cachedContextMap.get(query);

    if (!ctx) {
        const traits: Trait[] = [];
        const stores: Store<any>[] = [];
        const instances: TraitInstance[] = [];

        getQueryStores(params, traits, stores, instances, world);

        const traitCount = traits.length;
        const accessors: TraitAccessors[] = new Array(traitCount);
        const isAos: boolean[] = new Array(traitCount);
        for (let i = 0; i < traitCount; i++) {
            accessors[i] = instances[i].accessors;
            isAos[i] = instances[i].definition.schema.kind === 'aos';
        }

        ctx = {
            traits,
            stores,
            instances,
            accessors,
            isAos,
            traitCount,
            methods: {} as CachedQueryMethods,
        };

        ctx.methods = buildMethods<T>(world, query, traits, stores, instances, accessors, isAos, ctx);
        _cachedContextMap.set(query, ctx);
    } else {
        ctx.traits.length = 0;
        ctx.stores.length = 0;
        ctx.instances.length = 0;
        getQueryStores(params, ctx.traits, ctx.stores, ctx.instances, world);
        const newCount = ctx.traits.length;
        ctx.accessors.length = newCount;
        ctx.isAos.length = newCount;
        for (let i = 0; i < newCount; i++) {
            ctx.accessors[i] = ctx.instances[i].accessors;
            ctx.isAos[i] = ctx.instances[i].definition.schema.kind === 'aos';
        }
        ctx.traitCount = newCount;
    }

    const results = Object.assign(entities, ctx.methods) as unknown as QueryResult<T>;
    return results;
}

function buildMethods<T extends QueryParameter[]>(
    world: World,
    query: QueryInstance,
    traits: Trait[],
    stores: Store<any>[],
    instances: TraitInstance[],
    accessors: TraitAccessors[],
    isAos: boolean[],
    ctx: CachedQueryContext
): CachedQueryMethods {
    return {
        readEach(
            this: Entity[],
            callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void
        ) {
            const ents = this;
            const tc = ctx.traitCount;
            const state = Array.from({
                length: tc,
            }) as InstancesFromParameters<T>;
            for (let i = 0; i < ents.length; i++) {
                const entity = ents[i];
                const eid = getEntityId(entity);
                for (let j = 0; j < tc; j++) {
                    state[j] = accessors[j].get(eid, stores[j]);
                }
                callback(state, entity, i);
            }
            return ents;
        },

        updateEach(
            this: Entity[],
            callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
            options: QueryResultOptions = { changeDetection: 'auto' }
        ) {
            const ents = this;
            const tc = ctx.traitCount;
            const state = Array.from({ length: tc });

            if (options.changeDetection === 'auto') {
                const changedPairs: [Entity, Trait, TraitInstance][] = [];
                const atomicSnapshots: any[] = [];
                const trackedIndices: number[] = [];
                const untrackedIndices: number[] = [];

                getTrackedTraits(traits, world, query, trackedIndices, untrackedIndices);

                for (let i = 0; i < ents.length; i++) {
                    const entity = ents[i];
                    const eid = getEntityId(entity);

                    for (let j = 0; j < tc; j++) {
                        const value = accessors[j].get(eid, stores[j]);
                        state[j] = value;
                        atomicSnapshots[j] = isAos[j] ? { ...value } : null;
                    }
                    callback(state as unknown as InstancesFromParameters<T>, entity, i);

                    if (!world.has(entity)) continue;

                    for (let j = 0; j < trackedIndices.length; j++) {
                        const index = trackedIndices[j];
                        const newValue = state[index];
                        const store = stores[index];
                        const acc = accessors[index];

                        let changed = false;
                        if (isAos[index]) {
                            changed = acc.fastSetWithChangeDetection(eid, store, newValue as any);
                            if (!changed) {
                                changed = !shallowEqual(newValue, atomicSnapshots[index]);
                            }
                        } else {
                            changed = acc.fastSetWithChangeDetection(eid, store, newValue as any);
                        }

                        if (changed) changedPairs.push([entity, traits[index], instances[index]]);
                    }

                    for (let j = 0; j < untrackedIndices.length; j++) {
                        const index = untrackedIndices[j];
                        accessors[index].fastSet(eid, stores[index], state[index] as any);
                    }
                }

                for (let i = 0; i < changedPairs.length; i++) {
                    const [entity, trait, inst] = changedPairs[i];
                    setChangedFast(world, entity, trait, inst);
                }
            } else if (options.changeDetection === 'always') {
                const changedPairs: [Entity, Trait, TraitInstance][] = [];
                const atomicSnapshots: any[] = [];

                for (let i = 0; i < ents.length; i++) {
                    const entity = ents[i];
                    const eid = getEntityId(entity);

                    for (let j = 0; j < tc; j++) {
                        const value = accessors[j].get(eid, stores[j]);
                        state[j] = value;
                        atomicSnapshots[j] = isAos[j] ? { ...value } : null;
                    }
                    callback(state as unknown as InstancesFromParameters<T>, entity, i);

                    if (!world.has(entity)) continue;

                    for (let j = 0; j < tc; j++) {
                        const newValue = state[j];
                        const acc = accessors[j];

                        let changed = false;
                        if (isAos[j]) {
                            changed = acc.fastSetWithChangeDetection(eid, stores[j], newValue as any);
                            if (!changed) {
                                changed = !shallowEqual(newValue, atomicSnapshots[j]);
                            }
                        } else {
                            changed = acc.fastSetWithChangeDetection(eid, stores[j], newValue as any);
                        }

                        if (changed) changedPairs.push([entity, traits[j], instances[j]]);
                    }
                }

                for (let i = 0; i < changedPairs.length; i++) {
                    const [entity, trait, inst] = changedPairs[i];
                    setChangedFast(world, entity, trait, inst);
                }
            } else if (options.changeDetection === 'never') {
                for (let i = 0; i < ents.length; i++) {
                    const entity = ents[i];
                    const eid = getEntityId(entity);

                    for (let j = 0; j < tc; j++) {
                        state[j] = accessors[j].get(eid, stores[j]);
                    }
                    callback(state as unknown as InstancesFromParameters<T>, entity, i);

                    if (!world.has(entity)) continue;

                    for (let j = 0; j < tc; j++) {
                        accessors[j].fastSet(eid, stores[j], state[j] as any);
                    }
                }
            }

            return ents;
        },

        useStores(
            this: Entity[],
            callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void
        ) {
            callback(stores as unknown as StoresFromParameters<T>, this);
            return this;
        },

        forEachBlock(
            this: Entity[],
            callback: (stores: StoresFromParameters<T>, offsets: Uint16Array, count: number) => void
        ) {
            const tc = ctx.traitCount;
            const qInst = query;

            // cache bitset arrays on the query to avoid allocations on every call
            let reqBits = (qInst as any)._reqBits as HiSparseBitSet[] | undefined;
            let forbBits = (qInst as any)._forbBits as HiSparseBitSet[] | undefined;
            if (!reqBits) {
                reqBits = [];
                for (let i = 0; i < qInst.traitInstances.required.length; i++)
                    reqBits[i] = qInst.traitInstances.required[i].bitSet;
                (qInst as any)._reqBits = reqBits;
            }
            if (!forbBits) {
                forbBits = [];
                for (let i = 0; i < qInst.traitInstances.forbidden.length; i++)
                    forbBits[i] = qInst.traitInstances.forbidden[i].bitSet;
                (qInst as any)._forbBits = forbBits;
            }

            // reusable offsets buffer (max 1024 entities per block)
            const offsetsBuf = new Uint16Array(1024);
            // one store view per trait, reused across blocks
            const blockStores: any[] = new Array(tc);

            // for soa traits, build a skeleton object per trait so we can swap
            // its backing arrays each block without allocating new objects
            const storeKeys: string[][] = new Array(tc);
            for (let j = 0; j < tc; j++) {
                if (isAos[j]) {
                    blockStores[j] = stores[j];
                    storeKeys[j] = [];
                } else {
                    const keys = Object.keys(stores[j] as any);
                    storeKeys[j] = keys;
                    const view: Record<string, unknown[] | null> = {};
                    for (let k = 0; k < keys.length; k++) view[keys[k]] = null;
                    blockStores[j] = view;
                }
            }

            forEachBlockQuery(reqBits, forbBits, (blockIdx, l2Words) => {
                // point each soa trait's view at the current block's arrays
                for (let j = 0; j < tc; j++) {
                    if (storeKeys[j].length === 0) continue; // AoS — already set
                    const store = stores[j] as any;
                    const keys = storeKeys[j];
                    const view = blockStores[j];
                    for (let k = 0; k < keys.length; k++) {
                        view[keys[k]] = store[keys[k]][blockIdx] ?? null;
                    }
                }

                // fast path: if every slot in the block is active, skip the
                // bit-extraction loop and use the pre-built 0..1023 offsets
                let allFull = true;
                for (let l2i = 0; l2i < 32; l2i++) {
                    if (l2Words[l2i] !== 0xffffffff) {
                        allFull = false;
                        break;
                    }
                }

                if (allFull) {
                    callback(blockStores as unknown as StoresFromParameters<T>, _seqOffsets, 1024);
                    return;
                }

                // slow path: walk the bitmask to collect only the active offsets
                let count = 0;
                for (let l2i = 0; l2i < 32; l2i++) {
                    let word = l2Words[l2i];
                    if (word === 0) continue;
                    const base = l2i << 5;
                    while (word !== 0) {
                        const bit = ctz32(word);
                        word &= word - 1;
                        offsetsBuf[count++] = base | bit;
                    }
                }

                callback(blockStores as unknown as StoresFromParameters<T>, offsetsBuf, count);
            });

            return this;
        },

        select(this: Entity[] & CachedQueryMethods, ...newParams: QueryParameter[]) {
            traits.length = 0;
            stores.length = 0;
            instances.length = 0;
            getQueryStores(newParams, traits, stores, instances, world);
            const newCount = traits.length;
            accessors.length = newCount;
            isAos.length = newCount;
            for (let i = 0; i < newCount; i++) {
                accessors[i] = instances[i].accessors;
                isAos[i] = instances[i].definition.schema.kind === 'aos';
            }
            ctx.traitCount = newCount;
            return this;
        },

        sort(
            this: Entity[],
            callback: (a: Entity, b: Entity) => number = (a, b) => getEntityId(a) - getEntityId(b)
        ) {
            Array.prototype.sort.call(this, callback);
            return this;
        },
    };
}

function getTrackedTraits(
    traits: Trait[],
    world: World,
    query: QueryInstance,
    trackedIndices: number[],
    untrackedIndices: number[]
) {
    for (let i = 0; i < traits.length; i++) {
        const trait = traits[i];
        const hasTracked = world[$internal].trackedTraits.has(trait);
        const hasChanged = query.hasChangedModifiers && query.changedTraits.has(trait);

        if (hasTracked || hasChanged) trackedIndices.push(i);
        else untrackedIndices.push(i);
    }
}

/* @inline */ export function getQueryStores<T extends QueryParameter[]>(
    params: T,
    traits: Trait[],
    stores: Store<any>[],
    instances: TraitInstance[],
    world: World
) {
    const ctx = world[$internal];
    for (let i = 0; i < params.length; i++) {
        const param = params[i];

        // handle relation pairs
        if (isPairPattern(param)) {
            const [relation] = param;
            if (relation.schema.kind !== 'tag') {
                const inst = getTraitInstance(ctx.traitInstances, relation)!;
                traits.push(relation);
                stores.push(inst.store);
                instances.push(inst);
            }
            continue;
        }

        if (isModifier(param)) {
            // skip not modifiers — they exclude, not include
            if (param.type === 'not') continue;

            const modifierTraits = param.traits;
            for (const trait of modifierTraits) {
                if (trait.schema.kind === 'tag') continue; // Skip tags
                const inst = getTraitInstance(ctx.traitInstances, trait)!;
                traits.push(trait);
                stores.push(inst.store);
                instances.push(inst);
            }
        } else {
            const trait = param as Trait;
            if (trait.schema.kind === 'tag') continue; // Skip tags
            const inst = getTraitInstance(ctx.traitInstances, trait)!;
            traits.push(trait);
            stores.push(inst.store);
            instances.push(inst);
        }
    }
}

export function createEmptyQueryResult(): QueryResult<QueryParameter[]> {
    const results = Object.assign([], {
        readEach: () => results,
        updateEach: () => results,
        useStores: () => results,
        forEachBlock: () => results,
        select: () => results,
        sort: () => results,
    }) as QueryResult<QueryParameter[]>;

    return results;
}

// shared no-op methods for queries that only match on relations (no trait data to read)
const relationOnlyMethods = {
    readEach(this: QueryResult<any>, callback: any) {
        // no traits to read, just iterate entities
        for (let i = 0; i < this.length; i++) {
            callback([], this[i], i);
        }
        return this;
    },
    updateEach(this: QueryResult<any>, callback: any) {
        // no traits to update, just iterate entities
        for (let i = 0; i < this.length; i++) {
            callback([], this[i], i);
        }
        return this;
    },
    useStores(this: QueryResult<any>, callback: any) {
        // no stores available, call with empty array
        callback([], this);
        return this;
    },
    forEachBlock(this: QueryResult<any>) {
        // nothing to iterate block-wise
        return this;
    },
    select(this: QueryResult<any>) {
        // nothing to narrow down
        return this;
    },
};

/**
 * query result for relation-only queries — skips store/trait setup
 * since we only need to iterate matched entities.
 */
export function createRelationOnlyQueryResult<T extends QueryParameter[]>(
    entities: Entity[]
): QueryResult<T> {
    const results = Object.assign(entities, {
        readEach: relationOnlyMethods.readEach,
        updateEach: relationOnlyMethods.updateEach,
        useStores: relationOnlyMethods.useStores,
        forEachBlock: relationOnlyMethods.forEachBlock,
        select: relationOnlyMethods.select,
        sort(
            callback: (a: Entity, b: Entity) => number = (a, b) => getEntityId(a) - getEntityId(b)
        ): QueryResult<T> {
            Array.prototype.sort.call(entities, callback);
            return results;
        },
    }) as unknown as QueryResult<T>;

    return results;
}
