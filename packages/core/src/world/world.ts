import { $internal } from '../common';
import { createRawEntity, destroyEntity } from '../entity/entity';
import { createEntityHandle, createNewEntityHandle } from '../entity/entity-handle';
import type { Entity, RawEntity } from '../entity/types';
import { isEntityHandle, toRawEntity } from '../entity/types';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { IsExcluded, createQueryInstance } from '../query/query';
import { createRelationOnlyQueryResult } from '../query/query-result';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { isQuery } from '../query/utils/is-query';
import { getTrackingCursor, setTrackingMasks, trackWorld, untrackWorld } from '../query/utils/tracking-cursor';
import { getEntitiesWithRelationTo } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelation, isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, hasTrait, registerTrait, removeTrait, setTrait } from '../trait/trait';
import { clearTraitInstance, getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type {
    ConfigurableTrait,
    ExtractSchema,
    SetTraitCallback,
    Trait,
    TraitRecord,
    TraitValue,
} from '../trait/types';
import type { World, WorldInternal, WorldOptions } from './types';

let worldIdCounter = 0;

export function createWorld(options: WorldOptions): World;
export function createWorld(...traits: ConfigurableTrait[]): World;
export function createWorld(
    optionsOrFirstTrait?: WorldOptions | ConfigurableTrait,
    ...traits: ConfigurableTrait[]
): World {
    const id = worldIdCounter++;
    type HookInput = Trait | Relation<Trait> | RelationPair<Trait>;
    type HookCallback = (entity: Entity, target?: Entity) => void;

    function resolveHookTrait(input: HookInput): Trait {
        if (isRelationPair(input)) return input[$internal].relation[$internal].trait;
        if (isRelation(input)) return input[$internal].trait;
        return input;
    }

    function resolveHookCallback(input: HookInput, callback: HookCallback): HookCallback {
        if (isRelationPair(input)) {
            const pairTarget = input[$internal].target;
            if (pairTarget === '*') return callback;
            return (entity: Entity, target?: Entity) => {
                if (target && toRawEntity(target) === toRawEntity(pairTarget as Entity | RawEntity)) {
                    callback(entity, target);
                }
            };
        }
        return callback;
    }

    const world = {
        [$internal]: {
            entityIndex: createEntityIndex(),
            entityMasks: [[]],
            entityTraits: [],
            bitflag: 1,
            traitInstances: [],
            relations: new Set(),
            queriesHashMap: new Map(),
            queryInstances: [],
            actionInstances: [],
            notQueries: new Set(),
            dirtyQueries: new Set(),
            dirtyMasks: new Map(),
            trackingSnapshots: new Map(),
            changedMasks: new Map(),
            worldEntity: null!,
            entityHandles: [],
            trackedTraits: new Set(),
            resetSubscriptions: new Set(),
        } as WorldInternal,

        traits: new Set<Trait>(),

        spawn(...spawnTraits: ConfigurableTrait[]): Entity {
            return createNewEntityHandle(world, createRawEntity(world, ...spawnTraits));
        },

        has(target: Entity | Trait): boolean {
            if (typeof target === 'object' && target !== null && isEntityHandle(target)) {
                return target.world === world && isEntityAlive(world[$internal].entityIndex, target.raw);
            }
            return typeof target === 'number'
                ? isEntityAlive(world[$internal].entityIndex, target)
                : hasTrait(world, toRawEntity(world[$internal].worldEntity), target);
        },

        add(...addTraits: ConfigurableTrait[]) {
            addTrait(world, toRawEntity(world[$internal].worldEntity), ...addTraits);
        },

        remove(...removeTraits: Trait[]) {
            removeTrait(world, toRawEntity(world[$internal].worldEntity), ...removeTraits);
        },

        get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
            return getTrait(world, toRawEntity(world[$internal].worldEntity), trait);
        },

        set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
            setTrait(world, toRawEntity(world[$internal].worldEntity), trait, value, true);
        },

        destroy() {
            destroyEntity(world, toRawEntity(world[$internal].worldEntity));
            world[$internal].worldEntity = null!;

            world.reset();
            untrackWorld(world);
        },

        reset() {
            const ctx = world[$internal];

            world.entities.forEach((entity) => {
                const rawEntity = toRawEntity(entity);
                if (isEntityAlive(world[$internal].entityIndex, rawEntity)) {
                    destroyEntity(world, rawEntity);
                }
            });

            ctx.entityIndex = createEntityIndex();
            ctx.entityTraits.length = 0;
            ctx.entityHandles.length = 0;
            ctx.entityMasks = [[]];
            ctx.bitflag = 1;

            clearTraitInstance(ctx.traitInstances);
            world.traits.clear();
            ctx.relations.clear();

            ctx.queriesHashMap.clear();
            ctx.queryInstances.length = 0;
            ctx.actionInstances.length = 0;
            ctx.dirtyQueries.clear();
            ctx.notQueries.clear();

            ctx.trackingSnapshots.clear();
            ctx.dirtyMasks.clear();
            ctx.changedMasks.clear();
            ctx.trackedTraits.clear();

            ctx.worldEntity = createEntityHandle(world, createRawEntity(world, IsExcluded));

            for (const sub of ctx.resetSubscriptions) {
                sub(world);
            }
        },

        query(...args: any[]) {
            const ctx = world[$internal];

            if (args.length === 1 && isQuery(args[0])) {
                const queryRef = args[0];
                let query = ctx.queryInstances[queryRef.id];
                if (query) return query.run(world, queryRef.parameters);

                query = ctx.queriesHashMap.get(queryRef.hash);
                if (!query) {
                    query = createQueryInstance(world, queryRef.parameters);
                    ctx.queriesHashMap.set(queryRef.hash, query);
                    if (queryRef.id >= ctx.queryInstances.length) {
                        ctx.queryInstances.length = queryRef.id + 1;
                    }
                    ctx.queryInstances[queryRef.id] = query;
                }
                return query.run(world, queryRef.parameters);
            } else {
                const params = args as QueryParameter[];

                if (params.length === 1 && isRelationPair(params[0])) {
                    const pairCtx = params[0][$internal];
                    const relation = pairCtx.relation;
                    const target = pairCtx.target;

                    if (typeof target === 'number' || isEntityHandle(target as any)) {
                        const rawTarget = toRawEntity(target as Entity | RawEntity);
                        const entities = getEntitiesWithRelationTo(
                            world,
                            relation as Relation<Trait>,
                            rawTarget
                        );
                        return createRelationOnlyQueryResult(world, entities.slice());
                    }
                }

                const hash = createQueryHash(params);
                let query = ctx.queriesHashMap.get(hash);

                if (!query) {
                    query = createQueryInstance(world, params);
                    ctx.queriesHashMap.set(hash, query);
                }

                return query.run(world, params);
            }
        },

        queryFirst(...args: [string] | QueryParameter[]) {
            // @ts-expect-error - Having an issue with the TS overloads.
            const raw = world.query(...args)[0];
            return raw === undefined ? undefined : createEntityHandle(world, raw);
        },

        onQueryAdd(
            args: Query<QueryParameter[]> | QueryParameter[],
            callback: (entity: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            let query: QueryInstance;

            if (isQuery(args)) {
                const queryRef = args;
                query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

                if (!query) {
                    query = createQueryInstance(world, queryRef.parameters);
                    ctx.queriesHashMap.set(queryRef.hash, query);
                    if (queryRef.id >= ctx.queryInstances.length) {
                        ctx.queryInstances.length = queryRef.id + 1;
                    }
                    ctx.queryInstances[queryRef.id] = query;
                }
            } else {
                const hash = createQueryHash(args as QueryParameter[]);
                query = ctx.queriesHashMap.get(hash)!;

                if (!query) {
                    query = createQueryInstance(world, args as QueryParameter[]);
                    ctx.queriesHashMap.set(hash, query);
                }
            }

            query.addSubscriptions.add(callback);

            return () => query.addSubscriptions.delete(callback);
        },

        onQueryRemove(
            args: Query<QueryParameter[]> | QueryParameter[],
            callback: (entity: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            let query: QueryInstance;

            if (isQuery(args)) {
                const queryRef = args;
                query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

                if (!query) {
                    query = createQueryInstance(world, queryRef.parameters);
                    ctx.queriesHashMap.set(queryRef.hash, query);
                    if (queryRef.id >= ctx.queryInstances.length) {
                        ctx.queryInstances.length = queryRef.id + 1;
                    }
                    ctx.queryInstances[queryRef.id] = query;
                }
            } else {
                const hash = createQueryHash(args as QueryParameter[]);
                query = ctx.queriesHashMap.get(hash)!;

                if (!query) {
                    query = createQueryInstance(world, args as QueryParameter[]);
                    ctx.queriesHashMap.set(hash, query);
                }
            }

            query.removeSubscriptions.add(callback);

            return () => query.removeSubscriptions.delete(callback);
        },

        onAdd<T extends Trait>(
            trait: T | Relation<T> | RelationPair<T>,
            callback: (entity: Entity, target?: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            const resolvedTrait = resolveHookTrait(trait);
            const resolvedCallback = resolveHookCallback(trait, callback);

            let data = getTraitInstance(ctx.traitInstances, resolvedTrait);

            if (!data) {
                registerTrait(world, resolvedTrait);
                data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
            }

            data.addSubscriptions.add(resolvedCallback);

            return () => data.addSubscriptions.delete(resolvedCallback);
        },

        onRemove<T extends Trait>(
            trait: T | Relation<T> | RelationPair<T>,
            callback: (entity: Entity, target?: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            const resolvedTrait = resolveHookTrait(trait);
            const resolvedCallback = resolveHookCallback(trait, callback);

            let data = getTraitInstance(ctx.traitInstances, resolvedTrait);

            if (!data) {
                registerTrait(world, resolvedTrait);
                data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
            }

            data.removeSubscriptions.add(resolvedCallback);

            return () => data.removeSubscriptions.delete(resolvedCallback);
        },

        onChange(
            trait: Trait | Relation<Trait> | RelationPair<Trait>,
            callback: (entity: Entity, target?: Entity) => void
        ) {
            const ctx = world[$internal];
            const resolvedTrait = resolveHookTrait(trait);
            const resolvedCallback = resolveHookCallback(trait, callback);

            if (!hasTraitInstance(ctx.traitInstances, resolvedTrait))
                registerTrait(world, resolvedTrait);

            const data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
            data.changeSubscriptions.add(resolvedCallback);

            ctx.trackedTraits.add(resolvedTrait);

            return () => {
                data.changeSubscriptions.delete(resolvedCallback);
                if (data.changeSubscriptions.size === 0) ctx.trackedTraits.delete(resolvedTrait);
            };
        },
    } as World;

    Object.defineProperty(world, 'id', {
        get: () => id,
        enumerable: true,
    });
    Object.defineProperty(world, 'entities', {
        get: () =>
            getAliveEntities(world[$internal].entityIndex).map((entity) => createEntityHandle(world, entity)),
        enumerable: true,
    });

    // Resolve init traits from options or variadic args.
    let initTraits: ConfigurableTrait[];
    if (
        optionsOrFirstTrait &&
        typeof optionsOrFirstTrait === 'object' &&
        !Array.isArray(optionsOrFirstTrait)
    ) {
        initTraits = (optionsOrFirstTrait as WorldOptions).traits ?? [];
    } else {
        initTraits = optionsOrFirstTrait ? [optionsOrFirstTrait, ...traits] : traits;
    }

    // Initialize world eagerly.
    const ctx = world[$internal];
    const cursor = getTrackingCursor();
    for (let i = 0; i < cursor; i++) {
        setTrackingMasks(world, i);
    }
    trackWorld(world);

    if (!hasTraitInstance(ctx.traitInstances, IsExcluded)) registerTrait(world, IsExcluded);
    ctx.worldEntity = createEntityHandle(world, createRawEntity(world, IsExcluded, ...initTraits));

    return world;
}
