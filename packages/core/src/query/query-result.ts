import { $internal } from '../common';
import { createEntityCursor, resetEntityCursor } from '../entity/entity-handle';
import type { Entity, RawEntity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isRelationPair } from '../relation/utils/is-relation';
import type { Relation } from '../relation/types';
import { Store } from '../storage';
import { getStore } from '../trait/trait';
import type { Trait } from '../trait/types';
import { shallowEqual } from '../utils/shallow-equal';
import type { World } from '../world';
import { isModifier } from './modifier';
import { setChanged } from './modifiers/changed';
import type {
    InstancesFromParameters,
    QueryInstance,
    QueryParameter,
    QueryResult,
    QueryResultOptions,
    StoresFromParameters,
} from './types';

function defineQueryResultMethods<T extends object>(result: T, methods: Record<string, unknown>): T {
    for (const [key, value] of Object.entries(methods)) {
        Object.defineProperty(result, key, {
            value,
            enumerable: false,
        });
    }
    return result;
}

export function createQueryResult<T extends QueryParameter[]>(
    world: World,
    dense: readonly RawEntity[],
    length: number,
    query: QueryInstance,
    params: QueryParameter[]
): QueryResult<T> {
    const traits: Trait[] = [];
    const stores: Store<any>[] = [];
    getQueryStores(params, traits, stores, world);
    const raw = new Array<RawEntity>(length);
    for (let i = 0; i < length; i++) {
        raw[i] = dense[i];
    }

    const results = raw as QueryResult<T>;

    Object.defineProperty(results, 'raw', {
        get: () => results,
        enumerable: false,
    });

    defineQueryResultMethods(results, {
        readEach(
            callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void
        ) {
            const state = Array.from({ length: traits.length }) as InstancesFromParameters<T>;
            const cursor = createEntityCursor(world, 0 as RawEntity);

            for (let i = 0; i < results.length; i++) {
                const entity = results[i];
                const eid = getEntityId(entity);
                createSnapshots(eid, traits, stores, state);
                callback(state, resetEntityCursor(cursor, world, entity), i);
            }

            return results;
        },

        updateEach(
            callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
            options: QueryResultOptions = { changeDetection: 'auto' }
        ) {
            const state = Array.from({ length: traits.length });
            const cursor = createEntityCursor(world, 0 as RawEntity);

            if (options.changeDetection === 'auto') {
                const changedPairs: [RawEntity, Trait][] = [];
                const atomicSnapshots: any[] = [];
                const trackedIndices: number[] = [];
                const untrackedIndices: number[] = [];

                getTrackedTraits(traits, world, query, trackedIndices, untrackedIndices);

                for (let i = 0; i < results.length; i++) {
                    const entity = results[i];
                    const eid = getEntityId(entity);

                    createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
                    callback(
                        state as unknown as InstancesFromParameters<T>,
                        resetEntityCursor(cursor, world, entity),
                        i
                    );

                    if (!world.has(entity)) continue;

                    for (let j = 0; j < trackedIndices.length; j++) {
                        const index = trackedIndices[j];
                        const trait = traits[index];
                        const ctx = trait[$internal];
                        const newValue = state[index];
                        const store = stores[index];

                        let changed = false;
                        if (ctx.type === 'aos') {
                            changed = ctx.fastSetWithChangeDetection(eid, store, newValue);
                            if (!changed) changed = !shallowEqual(newValue, atomicSnapshots[index]);
                        } else {
                            changed = ctx.fastSetWithChangeDetection(eid, store, newValue);
                        }

                        if (changed) changedPairs.push([entity, trait] as const);
                    }

                    for (let j = 0; j < untrackedIndices.length; j++) {
                        const index = untrackedIndices[j];
                        const trait = traits[index];
                        const ctx = trait[$internal];
                        ctx.fastSet(eid, stores[index], state[index]);
                    }
                }

                for (let i = 0; i < changedPairs.length; i++) {
                    const [entity, trait] = changedPairs[i];
                    setChanged(world, entity, trait);
                }
            } else if (options.changeDetection === 'always') {
                const changedPairs: [RawEntity, Trait][] = [];
                const atomicSnapshots: any[] = [];

                for (let i = 0; i < results.length; i++) {
                    const entity = results[i];
                    const eid = getEntityId(entity);

                    createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
                    callback(
                        state as unknown as InstancesFromParameters<T>,
                        resetEntityCursor(cursor, world, entity),
                        i
                    );

                    if (!world.has(entity)) continue;

                    for (let j = 0; j < traits.length; j++) {
                        const trait = traits[j];
                        const ctx = trait[$internal];
                        const newValue = state[j];

                        let changed = false;
                        if (ctx.type === 'aos') {
                            changed = ctx.fastSetWithChangeDetection(eid, stores[j], newValue);
                            if (!changed) changed = !shallowEqual(newValue, atomicSnapshots[j]);
                        } else {
                            changed = ctx.fastSetWithChangeDetection(eid, stores[j], newValue);
                        }

                        if (changed) changedPairs.push([entity, trait] as const);
                    }
                }

                for (let i = 0; i < changedPairs.length; i++) {
                    const [entity, trait] = changedPairs[i];
                    setChanged(world, entity, trait);
                }
            } else {
                for (let i = 0; i < results.length; i++) {
                    const entity = results[i];
                    const eid = getEntityId(entity);
                    createSnapshots(eid, traits, stores, state);
                    callback(
                        state as unknown as InstancesFromParameters<T>,
                        resetEntityCursor(cursor, world, entity),
                        i
                    );

                    if (!world.has(entity)) continue;

                    for (let j = 0; j < traits.length; j++) {
                        const trait = traits[j];
                        const ctx = trait[$internal];
                        ctx.fastSet(eid, stores[j], state[j]);
                    }
                }
            }

            return results;
        },

        useStores(callback: (stores: StoresFromParameters<T>, entities: readonly RawEntity[]) => void) {
            callback(stores as unknown as StoresFromParameters<T>, results);
            return results;
        },

        select<U extends QueryParameter[]>(...nextParams: U): QueryResult<U> {
            return createQueryResult(
                world,
                results,
                results.length,
                query,
                nextParams
            ) as unknown as QueryResult<U>;
        },

        sort(
            callback: (a: RawEntity, b: RawEntity) => number = (a, b) => getEntityId(a) - getEntityId(b)
        ): QueryResult<T> {
            const sorted = Array.from(results);
            sorted.sort(callback);
            return createQueryResult(world, sorted, sorted.length, query, params);
        },
    });

    Object.freeze(results);
    return results;
}

/* @inline */ function getTrackedTraits(
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

/* @inline */ function createSnapshots(
    entityId: number,
    traits: Trait[],
    stores: Store<any>[],
    state: any[]
) {
    for (let i = 0; i < traits.length; i++) {
        const trait = traits[i];
        const ctx = trait[$internal];
        const value = ctx.get(entityId, stores[i]);
        state[i] = value;
    }
}

/* @inline */ function createSnapshotsWithAtomic(
    entityId: number,
    traits: Trait[],
    stores: Store<any>[],
    state: any[],
    atomicSnapshots: any[]
) {
    for (let j = 0; j < traits.length; j++) {
        const trait = traits[j];
        const ctx = trait[$internal];
        const value = ctx.get(entityId, stores[j]);
        state[j] = value;
        atomicSnapshots[j] = ctx.type === 'aos' ? { ...value } : null;
    }
}

/* @inline */ export function getQueryStores<T extends QueryParameter[]>(
    params: T,
    traits: Trait[],
    stores: Store<any>[],
    world: World
) {
    for (let i = 0; i < params.length; i++) {
        const param = params[i];

        if (isRelationPair(param)) {
            const pairCtx = param[$internal];
            const relation = pairCtx.relation as Relation<Trait>;
            const baseTrait = relation[$internal].trait;
            if (baseTrait[$internal].type !== 'tag') {
                traits.push(baseTrait);
                stores.push(getStore(world, baseTrait));
            }
            continue;
        }

        if (isModifier(param)) {
            if (param.type === 'not') continue;

            const modifierTraits = param.traits;
            for (const trait of modifierTraits) {
                if (trait[$internal].type === 'tag') continue;
                traits.push(trait);
                stores.push(getStore(world, trait));
            }
        } else {
            const trait = param as Trait;
            if (trait[$internal].type === 'tag') continue;
            traits.push(trait);
            stores.push(getStore(world, trait));
        }
    }
}

export function createEmptyQueryResult(): QueryResult<QueryParameter[]> {
    const results = defineQueryResultMethods([], {
        readEach: () => results,
        updateEach: () => results,
        useStores: () => results,
        select: () => results,
        sort: () => results,
    }) as QueryResult<QueryParameter[]>;

    Object.defineProperty(results, 'raw', {
        get: () => results,
        enumerable: false,
    });

    Object.freeze(results);
    return results;
}

export function createRelationOnlyQueryResult<T extends QueryParameter[]>(
    world: World,
    entities: RawEntity[]
): QueryResult<T> {
    const results = defineQueryResultMethods(entities.slice(), {
        readEach(callback: (state: [], entity: Entity, index: number) => void) {
            const cursor = createEntityCursor(world, 0 as RawEntity);
            for (let i = 0; i < results.length; i++) {
                callback([], resetEntityCursor(cursor, world, results[i]), i);
            }
            return results;
        },
        updateEach(callback: (state: [], entity: Entity, index: number) => void) {
            const cursor = createEntityCursor(world, 0 as RawEntity);
            for (let i = 0; i < results.length; i++) {
                callback([], resetEntityCursor(cursor, world, results[i]), i);
            }
            return results;
        },
        useStores(callback: (stores: [], entities: readonly RawEntity[]) => void) {
            callback([], results);
            return results;
        },
        select<U extends QueryParameter[]>(): QueryResult<U> {
            return results as unknown as QueryResult<U>;
        },
        sort(
            callback: (a: RawEntity, b: RawEntity) => number = (a, b) => getEntityId(a) - getEntityId(b)
        ): QueryResult<T> {
            const sorted = entities.slice();
            sorted.sort(callback);
            return createRelationOnlyQueryResult(world, sorted);
        },
    }) as unknown as QueryResult<T>;

    Object.defineProperty(results, 'raw', {
        get: () => results,
        enumerable: false,
    });

    Object.freeze(results);
    return results;
}
