import { $internal } from '../common';
import { createEntity, destroyEntity } from '../entity/entity';
import type { Entity } from '../entity/types';
import { createEntityIndex, getAliveEntities, isEntityAlive } from '../entity/utils/entity-index';
import { packEntity, unpackEntity } from '../entity/utils/pack-entity';
import { IsExcluded, createQueryInstance } from '../query/query';
import { createRelationOnlyQueryResult } from '../query/query-result';
import type {
    Modifier,
    Query,
    QueryInstance,
    QueryParameter,
    QueryUnsubscriber,
} from '../query/types';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { createQueryHash } from '../query/utils/create-query-hash';
import { isQuery } from '../query/utils/is-query';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
import { getEntitiesWithRelationTo } from '../relation/relation';
import type { Relation } from '../relation/types';
import { isRelation, isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, hasTrait, registerTrait, removeTrait, setTrait } from '../trait/trait';
import { clearTraitInstance, getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type {
    ConfigurableTrait,
    ExtractSchema,
    ExtractStore,
    SetTraitCallback,
    Trait,
    TraitInstance,
    TraitRecord,
    TraitValue,
} from '../trait/types';
import { universe } from '../universe/universe';
import type { World, WorldInternal, WorldOptions, WorldSnapshot } from './types';
import { allocateWorldId, releaseWorldId } from './utils/world-index';

export function createWorld(options: WorldOptions): World;
export function createWorld(...traits: ConfigurableTrait[]): World;
export function createWorld(
    optionsOrFirstTrait?: WorldOptions | ConfigurableTrait,
    ...traits: ConfigurableTrait[]
): World {
    const id = allocateWorldId(universe.worldIndex);
    let isInitialized = false;
    let lazyTraits: ConfigurableTrait[] | undefined;

    const world = {
        [$internal]: {
            entityIndex: createEntityIndex(id),
            entityMasks: [[]],
            entityTraits: new Map(),
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
            trackedTraits: new Set(),
            resetSubscriptions: new Set(),
        } as WorldInternal,

        traits: new Set<Trait>(),

        init(...initTraits: ConfigurableTrait[]) {
            console.log('from koota', { world });
            const ctx = world[$internal];
            if (isInitialized) return;

            isInitialized = true;
            universe.worlds[id] = world;

            // Create uninitialized added masks.
            const cursor = getTrackingCursor();
            for (let i = 0; i < cursor; i++) {
                setTrackingMasks(world, i);
            }

            // Register system traits.
            if (!hasTraitInstance(ctx.traitInstances, IsExcluded)) registerTrait(world, IsExcluded);

            // Check for traits passed into lazy init
            if (lazyTraits) {
                initTraits = lazyTraits;
                // clear lazyTraits
                lazyTraits = undefined;
            }
            // Create world entity.
            ctx.worldEntity = createEntity(world, IsExcluded, ...initTraits);
        },

        spawn(...spawnTraits: ConfigurableTrait[]): Entity {
            return createEntity(world, ...spawnTraits);
        },

        has(target: Entity | Trait): boolean {
            return typeof target === 'number'
                ? isEntityAlive(world[$internal].entityIndex, target)
                : hasTrait(world, world[$internal].worldEntity, target);
        },

        add(...addTraits: ConfigurableTrait[]) {
            addTrait(world, world[$internal].worldEntity, ...addTraits);
        },

        remove(...removeTraits: Trait[]) {
            removeTrait(world, world[$internal].worldEntity, ...removeTraits);
        },

        get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
            return getTrait(world, world[$internal].worldEntity, trait);
        },

        set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
            setTrait(world, world[$internal].worldEntity, trait, value, true);
        },

        destroy() {
            // Destroy world entity.
            destroyEntity(world, world[$internal].worldEntity);
            world[$internal].worldEntity = null!;

            world.reset();
            isInitialized = false;
            // Clean up universe side effects.
            releaseWorldId(universe.worldIndex, id);
            universe.worlds[id] = null;
        },

        reset() {
            lazyTraits = undefined;
            const ctx = world[$internal];

            // Destroy all entities so any cleanup is done.
            world.entities.forEach((entity) => {
                // Some relations may have caused the entity to be destroyed before
                // we get to them in the loop.
                if (world.has(entity)) {
                    destroyEntity(world, entity);
                }
            });

            ctx.entityIndex = createEntityIndex(id);
            ctx.entityTraits.clear();
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

            // Create new world entity.
            ctx.worldEntity = createEntity(world, IsExcluded);

            for (const sub of ctx.resetSubscriptions) {
                sub(world);
            }
        },

        query(...args: any[]) {
            const ctx = world[$internal];

            // Check if first arg is a QueryRef
            if (args.length === 1 && isQuery(args[0])) {
                const queryRef = args[0];
                // Try array lookup first
                let query = ctx.queryInstances[queryRef.id];
                if (query) return query.run(world, queryRef.parameters);

                // Fallback to hash map
                query = ctx.queriesHashMap.get(queryRef.hash);
                if (!query) {
                    query = createQueryInstance(world, queryRef.parameters);
                    ctx.queriesHashMap.set(queryRef.hash, query);
                    // Store in array for fast future lookups
                    if (queryRef.id >= ctx.queryInstances.length) {
                        ctx.queryInstances.length = queryRef.id + 1;
                    }
                    ctx.queryInstances[queryRef.id] = query;
                }
                return query.run(world, queryRef.parameters);
            } else {
                const params = args as QueryParameter[];

                // Fast path: single relation pair with specific target
                if (params.length === 1 && isRelationPair(params[0])) {
                    const pairCtx = params[0][$internal];
                    const relation = pairCtx.relation;
                    const target = pairCtx.target;

                    // Only use fast path for specific targets
                    if (typeof target === 'number') {
                        const entities = getEntitiesWithRelationTo(
                            world,
                            relation as Relation<Trait>,
                            target as Entity
                        );
                        return createRelationOnlyQueryResult(entities.slice() as Entity[]);
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
            return world.query(...args)[0];
        },

        onQueryAdd(
            args: Query<QueryParameter[]> | QueryParameter[],
            callback: (entity: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            let query: QueryInstance;

            // Check if args is a QueryRef object
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

            // Check if args is a QueryRef object
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
            trait: T | Relation<T>,
            callback: (entity: Entity, target?: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            const target = isRelation(trait) ? trait[$internal].trait : trait;

            let data = getTraitInstance(ctx.traitInstances, target);

            if (!data) {
                registerTrait(world, target);
                data = getTraitInstance(ctx.traitInstances, target)!;
            }

            data.addSubscriptions.add(callback);

            return () => data.addSubscriptions.delete(callback);
        },

        onRemove<T extends Trait>(
            trait: T | Relation<T>,
            callback: (entity: Entity, target?: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            const target = isRelation(trait) ? trait[$internal].trait : trait;

            let data = getTraitInstance(ctx.traitInstances, target);

            if (!data) {
                registerTrait(world, target);
                data = getTraitInstance(ctx.traitInstances, target)!;
            }

            data.removeSubscriptions.add(callback);

            return () => data.removeSubscriptions.delete(callback);
        },

        onChange(
            trait: Trait | Relation<Trait>,
            callback: (entity: Entity, target?: Entity) => void
        ) {
            const ctx = world[$internal];
            const target = isRelation(trait) ? trait[$internal].trait : trait;

            // Register the trait if it's not already registered.
            if (!hasTraitInstance(ctx.traitInstances, target)) registerTrait(world, target);

            const data = getTraitInstance(ctx.traitInstances, target)!;
            data.changeSubscriptions.add(callback);

            // Used by auto change detection to know which traits to track.
            ctx.trackedTraits.add(target);

            return () => {
                data.changeSubscriptions.delete(callback);
                if (data.changeSubscriptions.size === 0) ctx.trackedTraits.delete(target);
            };
        },
        
        snapshot(...args: any[]): WorldSnapshot {
            const ctx = world[$internal];
            const { entityIndex, traitInstances: allInstances } = ctx;

            const entities = entityIndex.dense.slice(0, entityIndex.aliveCount);
            const entityMasks = ctx.entityMasks.map((gen) => [...gen]);
            const traitData: WorldSnapshot['traitData'] = [];
            let traits = [] as (TraitInstance | undefined)[]

            if (args.length === 1 && args[0] === '*') {
                traits = allInstances;
            } else {
                world.query(...args).useTraitInstances((traitInstances, entities)=>{
                    // if we want to exclude non entity matches
                    /// (for better query semantics)
                    //// should we remap ids?
                    ///// does load() destroy everything previous?
                    ////// can you do a partial snapshot?
                    // in this example you also get the full store back
                    /// TraitInstance > Store but same idea
                    /// but looping over the matching entities is what constrains it
                    //// to the matching entities (query semantics)
                    //// https://github.com/pmndrs/koota?tab=readme-ov-file#modifying-trait-stores-directly
                    traits = traitInstances;
                })
            }

            traits.forEach((instance) => {
                if (!instance) return;
                const { trait, store } = instance;
                const traitCtx = trait[$internal];
                const type = traitCtx.type;

                if (type === 'tag') return;

                if (type === 'soa') {
                    const schema = trait.schema as Record<string, any>;
                    const serializers = traitCtx.options?.serialize as Record<string, Function> | undefined;
                    
                    const data = Object.keys(schema).map((key) => {
                        let dataArray = (store as Record<string, unknown[]>)[key].slice(
                            0,
                            entityIndex.maxId
                        );
                        
                        // Check for per-column serializer
                        const serializer = serializers?.[key];
                        if (serializer) {
                            dataArray = dataArray.map((v) => (v === undefined || v === null) ? v : serializer(v));
                        }
                        
                        return dataArray;
                    });
                    traitData.push({ id: trait.id, type: 'soa', data });
                } else if (type === 'aos') {
                    let data = (store as any[]).slice(0, entityIndex.maxId);
                    
                    const serializer = traitCtx.options?.serialize as Function | undefined;
                    // Check for custom serializer
                    if (serializer) {
                        data = data.map((v) => v ? serializer(v) : v);
                    }

                    traitData.push({
                        id: trait.id,
                        type: 'aos',
                        data: JSON.stringify(data),
                    });
                }
            });
            
            // Gather Relation Topology
            const relations: WorldSnapshot['relations'] = [];
            traits.forEach((instance) => {
                if (!instance || !instance.relationTargets) return;
                const { trait, relationTargets } = instance;
                const traitCtx = trait[$internal];
                const relation = traitCtx.relation;
                if (!relation) return;

                const isExclusive = relation[$internal].exclusive;
                if (isExclusive) {
                    // Exclusive: Array of Entity IDs (or undefined)
                    const data = (relationTargets as (number | undefined)[]).slice(
                        0,
                        entityIndex.maxId
                    );
                    relations.push({ id: trait.id, type: 'exclusive', data });
                } else {
                    // Non-Exclusive: Array of Array of Entity IDs
                    // We use JSON here to handle the nested variable-length arrays easily
                    const rawData = (relationTargets as number[][]).slice(0, entityIndex.maxId);
                    relations.push({
                        id: trait.id,
                        type: 'relation',
                        data: JSON.stringify(rawData),
                    });
                }
            });
            
            return {
                worldId: id,
                maxId: entityIndex.maxId,
                aliveCount: entityIndex.aliveCount,
                entities,
                entityMasks,
                traitData,
                relations,
            };
        },

        load(snapshot: WorldSnapshot) {
            console.log('load()', { snapshot });
            const ctx = world[$internal];
            const { maxId, aliveCount, entities, entityMasks, traitData, relations } = snapshot;

            // Restore Entity Index & Swizzle World IDs
            const currentWorldId = world.id;
            const newDense = new Array(entities.length);
            // We reset sparse to be empty; we will populate indices for alive entities only.
            const newSparse: number[] = [];

            for (let i = 0; i < entities.length; i++) {
                const snapshotEntity = entities[i] as Entity;
                const { generation, entityId } = unpackEntity(snapshotEntity);

                let localEntity;
                if (currentWorldId !== world.id) {
                    localEntity = packEntity(currentWorldId, generation, entityId);
                } else {
                    localEntity = snapshotEntity;
                }

                newDense[i] = localEntity;
                newSparse[entityId] = i;
            }

            ctx.entityIndex.maxId = maxId;
            ctx.entityIndex.aliveCount = aliveCount;
            ctx.entityIndex.dense = newDense;
            ctx.entityIndex.sparse = newSparse;

            ctx.entityMasks = entityMasks.map((gen) => [...gen]);

            for (const t of traitData) {
                const instance = ctx.traitInstances[t.id];
                if (!instance) continue;

                const traitCtx = instance.trait[$internal];

                if (t.type === 'soa') {
                    const schema = instance.schema as Record<string, any>;
                    const keys = Object.keys(schema);
                    const store = instance.store as Record<string, unknown[]>;
                    const data = t.data;
                    const deserializers = traitCtx.options?.deserialize as Record<string, Function> | undefined;

                    for (let k = 0; k < keys.length; k++) {
                        const key = keys[k];
                        const val = schema[key];
                        let dataArray = data[k];

                        if (dataArray !== undefined) {
                            const deserializer = deserializers?.[key];
                            if (deserializer) {
                                // For hydration, we retrieve the current value from the store to pass to deserialize
                                const currentStore = store[key];
                                dataArray = dataArray.map((v: any, idx: number) => 
                                    (v === undefined || v === null) ? v : deserializer(v, currentStore[idx])
                                );
                            }
                            store[key] = dataArray;
                        }
                    }
                } else {
                    const store = instance.store as any[];
                    let deserialized = JSON.parse(t.data);
                    const deserializer = traitCtx.options?.deserialize as Function | undefined;
                    
                    if (deserializer) {
                        const newStore = deserialized.map((v: any, idx: number) =>
                           v ? deserializer(v, store[idx]) : v
                        );
                        deserialized = newStore;
                    }
                    store.length = 0;
                    store.push(...deserialized);
                }
            }

            for (const r of relations) {
                const instance = ctx.traitInstances[r.id];
                if (!instance) continue;

                if (r.type === 'exclusive') {
                    instance.relationTargets = r.data;
                } else {
                    // Non-exclusive data comes in as a JSON string in the snapshot object
                    instance.relationTargets = JSON.parse(r.data);
                }
            }

            // clear queries
            const invalidate = (q: any) => {
                q.entities.clear();
                q.toRemove.clear();
            };
            ctx.queryInstances.forEach((q) => q && invalidate(q));
            ctx.queriesHashMap.forEach(invalidate);

            // repopulate queries
            const activeEntities = newDense.slice(0, aliveCount);
            ctx.queriesHashMap.forEach((query) => {
                // skip tracking queries (Added/Removed/Changed).
                // they rely on history diffs which don't exist in a snapshot load.
                if (query.isTracking) return;

                const hasRelationFilters = query.relationFilters && query.relationFilters.length > 0;

                for (const entity of activeEntities) {
                    const match = hasRelationFilters
                        ? checkQueryWithRelations(world, query, entity)
                        : query.check(world, entity);

                    if (match) {
                        // Manually add to entities to avoid triggering 'onQueryAdd' subscriptions
                        // during a hydration event (which can cause cascading side effects).
                        query.entities.add(entity);
                    }
                }

                // Bump version so useQuery hooks know to re-render
                query.version++;
            });
            // we also need this for react hooks
            for (const sub of world[$internal].resetSubscriptions) {
                sub(world);
            }
        },
    } as World;

    // Read-only properties via getters
    Object.defineProperty(world, 'id', {
        get: () => id,
        enumerable: true,
    });
    Object.defineProperty(world, 'isInitialized', {
        get: () => isInitialized,
        enumerable: true,
    });
    Object.defineProperty(world, 'entities', {
        get: () => getAliveEntities(world[$internal].entityIndex),
        enumerable: true,
    });

    // Handle initialization based on arguments
    if (
        optionsOrFirstTrait &&
        typeof optionsOrFirstTrait === 'object' &&
        !Array.isArray(optionsOrFirstTrait)
    ) {
        const { traits: optionTraits = [], lazy = false } = optionsOrFirstTrait as WorldOptions;
        if (!lazy) {
            world.init(...optionTraits);
        } else {
            lazyTraits = optionTraits;
        }
    } else {
        world.init(...(optionsOrFirstTrait ? [optionsOrFirstTrait, ...traits] : traits));
    }

    return world;
}
