import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { isEntityAlive } from '../entity/utils/entity-index';
import { isRelationPair } from '../relation/utils/is-relation';
import type { Relation } from '../relation/types';
import { Store } from '../storage';
import { getStore } from '../trait/trait';
import type { Trait } from '../trait/types';
import { shallowEqual } from '../utils/shallow-equal';
import type { WorldInternal } from '../world';
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

export function createQueryResult<T extends QueryParameter[]>(
    ctx: WorldInternal,
    entities: Entity[],
    query: QueryInstance,
    params: QueryParameter[]
): QueryResult<T> {
    const traits: Trait[] = [];
    const stores: Store<any>[] = [];

    getQueryStores(params, traits, stores, ctx);

    const results = Object.assign(entities, {
        readEach(
            callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void
        ) {
            const state = Array.from({ length: traits.length }) as InstancesFromParameters<T>;

            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                const eid = getEntityId(entity);

                createSnapshots(eid, traits, stores, state);

                callback(state, entity, i);
            }

            return results;
        },

        updateEach(
            callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
            options: QueryResultOptions = { changeDetection: 'auto' }
        ) {
            const state = Array.from({ length: traits.length });

            if (options.changeDetection === 'auto') {
                const changedPairs: [Entity, Trait][] = [];
                const atomicSnapshots: any[] = [];
                const trackedIndices: number[] = [];
                const untrackedIndices: number[] = [];

                getTrackedTraits(traits, ctx, query, trackedIndices, untrackedIndices);

                for (let i = 0; i < entities.length; i++) {
                    const entity = entities[i];
                    const eid = getEntityId(entity);

                    createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
                    callback(state as unknown as InstancesFromParameters<T>, entity, i);

                    if (!isEntityAlive(ctx.entityIndex, entity)) continue;

                    for (let j = 0; j < trackedIndices.length; j++) {
                        const index = trackedIndices[j];
                        const trait = traits[index];
                        const traitCtx = trait[$internal];
                        const newValue = state[index];
                        const store = stores[index];

                        let changed = false;
                        if (traitCtx.type === 'aos') {
                            changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
                            if (!changed) {
                                changed = !shallowEqual(newValue, atomicSnapshots[index]);
                            }
                        } else {
                            changed = traitCtx.fastSetWithChangeDetection(eid, store, newValue);
                        }

                        if (changed) changedPairs.push([entity, trait] as const);
                    }

                    for (let j = 0; j < untrackedIndices.length; j++) {
                        const index = untrackedIndices[j];
                        const trait = traits[index];
                        const traitCtx = trait[$internal];
                        const store = stores[index];
                        traitCtx.fastSet(eid, store, state[index]);
                    }
                }

                for (let i = 0; i < changedPairs.length; i++) {
                    const [entity, trait] = changedPairs[i];
                    setChanged(ctx, entity, trait);
                }
            } else if (options.changeDetection === 'always') {
                const changedPairs: [Entity, Trait][] = [];
                const atomicSnapshots: any[] = [];

                for (let i = 0; i < entities.length; i++) {
                    const entity = entities[i];
                    const eid = getEntityId(entity);

                    createSnapshotsWithAtomic(eid, traits, stores, state, atomicSnapshots);
                    callback(state as unknown as InstancesFromParameters<T>, entity, i);

                    if (!isEntityAlive(ctx.entityIndex, entity)) continue;

                    for (let j = 0; j < traits.length; j++) {
                        const trait = traits[j];
                        const traitCtx = trait[$internal];
                        const newValue = state[j];

                        let changed = false;
                        if (traitCtx.type === 'aos') {
                            changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
                            if (!changed) {
                                changed = !shallowEqual(newValue, atomicSnapshots[j]);
                            }
                        } else {
                            changed = traitCtx.fastSetWithChangeDetection(eid, stores[j], newValue);
                        }

                        if (changed) changedPairs.push([entity, trait] as const);
                    }
                }

                for (let i = 0; i < changedPairs.length; i++) {
                    const [entity, trait] = changedPairs[i];
                    setChanged(ctx, entity, trait);
                }
            } else if (options.changeDetection === 'never') {
                for (let i = 0; i < entities.length; i++) {
                    const entity = entities[i];
                    const eid = getEntityId(entity);
                    createSnapshots(eid, traits, stores, state);
                    callback(state as unknown as InstancesFromParameters<T>, entity, i);

                    if (!isEntityAlive(ctx.entityIndex, entity)) continue;

                    for (let j = 0; j < traits.length; j++) {
                        const trait = traits[j];
                        const traitCtx = trait[$internal];
                        traitCtx.fastSet(eid, stores[j], state[j]);
                    }
                }
            }

            return results;
        },

        useStores(callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void) {
            callback(stores as unknown as StoresFromParameters<T>, entities);
            return results;
        },

        select<U extends QueryParameter[]>(...params: U): QueryResult<U> {
            traits.length = 0;
            stores.length = 0;
            getQueryStores(params, traits, stores, ctx);
            return results as unknown as QueryResult<U>;
        },

        sort(
            callback: (a: Entity, b: Entity) => number = (a, b) => getEntityId(a) - getEntityId(b)
        ): QueryResult<T> {
            Array.prototype.sort.call(entities, callback);
            return results;
        },
    });

    return results;
}

/* @inline */ function getTrackedTraits(
    traits: Trait[],
    ctx: WorldInternal,
    query: QueryInstance,
    trackedIndices: number[],
    untrackedIndices: number[]
) {
    for (let i = 0; i < traits.length; i++) {
        const trait = traits[i];
        const hasTracked = ctx.trackedTraits.has(trait);
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
    ctx: WorldInternal
) {
    for (let i = 0; i < params.length; i++) {
        const param = params[i];

        if (isRelationPair(param)) {
            const pairCtx = param[$internal];
            const relation = pairCtx.relation as Relation<Trait>;
            const baseTrait = relation[$internal].trait;
            if (baseTrait[$internal].type !== 'tag') {
                traits.push(baseTrait);
                stores.push(getStore(ctx, baseTrait));
            }
            continue;
        }

        if (isModifier(param)) {
            if (param.type === 'not') continue;

            const modifierTraits = param.traits;
            for (const trait of modifierTraits) {
                if (trait[$internal].type === 'tag') continue;
                traits.push(trait);
                stores.push(getStore(ctx, trait));
            }
        } else {
            const trait = param as Trait;
            if (trait[$internal].type === 'tag') continue;
            traits.push(trait);
            stores.push(getStore(ctx, trait));
        }
    }
}

export function createEmptyQueryResult(): QueryResult<QueryParameter[]> {
    const results = Object.assign([], {
        readEach: () => results,
        updateEach: () => results,
        useStores: () => results,
        select: () => results,
        sort: () => results,
    }) as QueryResult<QueryParameter[]>;

    return results;
}

const relationOnlyMethods = {
    readEach(this: QueryResult<any>, callback: any) {
        for (let i = 0; i < this.length; i++) {
            callback([], this[i], i);
        }
        return this;
    },
    updateEach(this: QueryResult<any>, callback: any) {
        for (let i = 0; i < this.length; i++) {
            callback([], this[i], i);
        }
        return this;
    },
    useStores(this: QueryResult<any>, callback: any) {
        callback([], this);
        return this;
    },
    select(this: QueryResult<any>) {
        return this;
    },
};

export function createRelationOnlyQueryResult<T extends QueryParameter[]>(
    entities: Entity[]
): QueryResult<T> {
    const results = Object.assign(entities, {
        readEach: relationOnlyMethods.readEach,
        updateEach: relationOnlyMethods.updateEach,
        useStores: relationOnlyMethods.useStores,
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
