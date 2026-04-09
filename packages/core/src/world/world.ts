import { $internal } from '../common';
import { createEntity, destroyEntity } from '../entity/entity';
import type { Entity } from '../entity/types';
import {
    createEntityIndex,
    getAliveEntities,
    isEntityAlive,
    releaseOwnedPages,
} from '../entity/utils/entity-index';
import type { PageCleanupToken } from '../entity/utils/page-allocator';
import { createEmptyMaskGeneration } from '../entity/utils/paged-mask';
import { IsExcluded, createQuery, createQueryInstance } from '../query/query';
import { createRelationOnlyQueryResult } from '../query/query-result';
import type { Query, QueryInstance, QueryParameter, QueryUnsubscriber } from '../query/types';
import { createQueryHash } from '../query/utils/create-query-hash';
import { isQuery } from '../query/utils/is-query';
import { getTrackingCursor, setTrackingMasks } from '../query/utils/tracking-cursor';
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
import { universe } from '../universe/universe';
import type { World, WorldContext } from './types';

let nextWorldId = 0;

/**
 * Lazily registers a world in the universe on first mutation.
 * Sets up tracking masks, registers IsExcluded, creates the world entity.
 */
function ensureWorldRegistered(ctx: WorldContext, world: World, id: number): void {
    if (ctx.isRegistered) return;
    ctx.isRegistered = true;
    if (ctx.cleanupToken) ctx.cleanupToken.registered = true;

    universe.worlds[id] = ctx;

    const cursor = getTrackingCursor();
    for (let i = 0; i < cursor; i++) {
        setTrackingMasks(ctx, i);
    }

    if (!hasTraitInstance(ctx.traitInstances, IsExcluded)) registerTrait(ctx, IsExcluded);

    const pending = ctx.pendingTraits;
    ctx.pendingTraits = undefined;
    ctx.worldEntity = createEntity(ctx, IsExcluded, ...(pending || []));
}

export function createWorld(...traits: ConfigurableTrait[]): World {
    const id = nextWorldId++;
    type HookInput = Trait | Relation<Trait> | RelationPair<Trait>;
    type HookCallback = (entity: Entity, target?: Entity) => void;

    function resolveHookTrait(input: HookInput): Trait {
        if (isRelationPair(input)) return input.relation[$internal].trait;
        if (isRelation(input)) return input[$internal].trait;
        return input;
    }

    function resolveHookCallback(input: HookInput, callback: HookCallback): HookCallback {
        if (isRelationPair(input)) {
            const pairTargetQuery = input.targetQuery;
            if (pairTargetQuery) {
                const targetQuery = isQuery(pairTargetQuery)
                    ? pairTargetQuery
                    : createQuery(...pairTargetQuery);

                return (entity: Entity, target?: Entity) => {
                    /**
                     * @todo This should be using the same caching logic as the query system
                     * instead of searching with `includes`.
                     */
                    if (target !== undefined && world.query(targetQuery).includes(target)) {
                        callback(entity, target);
                    }
                };
            }

            const pairTarget = input.target;
            if (pairTarget === '*') return callback;

            return (entity: Entity, target?: Entity) => {
                if (target === pairTarget) callback(entity, target);
            };
        }

        return callback;
    }

    const pendingTraits = traits.length > 0 ? traits : undefined;

    const cleanupToken: PageCleanupToken = { ownedPages: [], registered: false };

    const world = {
        [$internal]: {
            entityIndex: null! as ReturnType<typeof createEntityIndex>,
            entityMasks: [createEmptyMaskGeneration()],
            entityTraits: new Map(),
            bitflag: 1,
            traitInstances: [],
            traits: new Set<Trait>(),
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
            isRegistered: false,
            pendingTraits,
            cleanupToken,
        } as WorldContext,

        traits: null! as Set<Trait>,

        spawn(...spawnTraits: ConfigurableTrait[]): Entity {
            const ctx = world[$internal];
            ensureWorldRegistered(ctx, world, id);
            return createEntity(ctx, ...spawnTraits);
        },

        has(target: Entity | Trait): boolean {
            const ctx = world[$internal];
            if (!ctx.isRegistered) {
                if (typeof target === 'number') return false;
                return false;
            }
            return typeof target === 'number'
                ? isEntityAlive(ctx.entityIndex, target)
                : hasTrait(ctx, ctx.worldEntity, target);
        },

        add(...addTraits: ConfigurableTrait[]) {
            const ctx = world[$internal];
            ensureWorldRegistered(ctx, world, id);
            addTrait(ctx, ctx.worldEntity, ...addTraits);
        },

        remove(...removeTraits: Trait[]) {
            const ctx = world[$internal];
            if (!ctx.isRegistered) return;
            removeTrait(ctx, ctx.worldEntity, ...removeTraits);
        },

        get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined {
            const ctx = world[$internal];
            if (!ctx.isRegistered) return undefined;
            return getTrait(ctx, ctx.worldEntity, trait);
        },

        set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>) {
            const ctx = world[$internal];
            ensureWorldRegistered(ctx, world, id);
            setTrait(ctx, ctx.worldEntity, trait, value, true);
        },

        destroy() {
            const ctx = world[$internal];
            if (ctx.isRegistered) {
                destroyEntity(ctx, ctx.worldEntity);
                ctx.worldEntity = null!;
                world.reset();
            }
            ctx.isRegistered = false;
            delete universe.worlds[id];
            universe.pageAllocator.worldFinalizer.unregister(world);
        },

        reset() {
            const ctx = world[$internal];
            if (!ctx.isRegistered) return;

            ctx.pendingTraits = undefined;

            world.entities.forEach((entity) => {
                if (isEntityAlive(ctx.entityIndex, entity)) {
                    destroyEntity(ctx, entity);
                }
            });

            releaseOwnedPages(ctx.entityIndex);
            ctx.entityIndex = createEntityIndex(universe.pageAllocator, ctx);
            // Re-link shared ownedPages for the cleanup token.
            ctx.entityIndex.ownedPages = cleanupToken.ownedPages;

            ctx.entityTraits.clear();
            ctx.entityMasks = [createEmptyMaskGeneration()];
            ctx.bitflag = 1;

            for (const query of ctx.queriesHashMap.values()) {
                for (let i = 0; i < query.cleanup.length; i++) {
                    query.cleanup[i]();
                }
            }

            clearTraitInstance(ctx.traitInstances);
            ctx.traits.clear();
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

            ctx.worldEntity = createEntity(ctx, IsExcluded);

            for (const sub of ctx.resetSubscriptions) {
                sub();
            }
        },

        query(...args: any[]) {
            const ctx = world[$internal];
            ensureWorldRegistered(ctx, world, id);

            if (args.length === 1 && isQuery(args[0])) {
                const queryRef = args[0];
                let query = ctx.queryInstances[queryRef.id];
                if (query) return query.run(ctx, queryRef.parameters);

                query = ctx.queriesHashMap.get(queryRef.hash);
                if (!query) {
                    query = createQueryInstance(ctx, queryRef.parameters);
                    ctx.queriesHashMap.set(queryRef.hash, query);
                    if (queryRef.id >= ctx.queryInstances.length) {
                        ctx.queryInstances.length = queryRef.id + 1;
                    }
                    ctx.queryInstances[queryRef.id] = query;
                }
                return query.run(ctx, queryRef.parameters);
            } else {
                const params = args as QueryParameter[];

                if (params.length === 1 && isRelationPair(params[0])) {
                    const relation = params[0].relation;
                    const target = params[0].target;

                    // Only use fast path for specific targets
                    if (!params[0].targetQuery && typeof target === 'number') {
                        const entities = getEntitiesWithRelationTo(
                            ctx,
                            relation as Relation<Trait>,
                            target as Entity
                        );
                        return createRelationOnlyQueryResult(entities as Entity[]);
                    }
                }

                const hash = createQueryHash(params);
                let query = ctx.queriesHashMap.get(hash);

                if (!query) {
                    query = createQueryInstance(ctx, params);
                    ctx.queriesHashMap.set(hash, query);
                }

                return query.run(ctx, params);
            }
        },

        queryFirst(...args: [string] | QueryParameter[]) {
            // @ts-expect-error
            return world.query(...args)[0];
        },

        onQueryAdd(
            args: Query<QueryParameter[]> | QueryParameter[],
            callback: (entity: Entity) => void
        ): QueryUnsubscriber {
            const ctx = world[$internal];
            ensureWorldRegistered(ctx, world, id);
            let query: QueryInstance;

            if (isQuery(args)) {
                const queryRef = args;
                query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

                if (!query) {
                    query = createQueryInstance(ctx, queryRef.parameters);
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
                    query = createQueryInstance(ctx, args as QueryParameter[]);
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
            ensureWorldRegistered(ctx, world, id);
            let query: QueryInstance;

            if (isQuery(args)) {
                const queryRef = args;
                query = ctx.queryInstances[queryRef.id] || ctx.queriesHashMap.get(queryRef.hash)!;

                if (!query) {
                    query = createQueryInstance(ctx, queryRef.parameters);
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
                    query = createQueryInstance(ctx, args as QueryParameter[]);
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
            ensureWorldRegistered(ctx, world, id);
            const resolvedTrait = resolveHookTrait(trait);
            const resolvedCallback = resolveHookCallback(trait, callback);

            let data = getTraitInstance(ctx.traitInstances, resolvedTrait);

            if (!data) {
                registerTrait(ctx, resolvedTrait);
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
            ensureWorldRegistered(ctx, world, id);
            const resolvedTrait = resolveHookTrait(trait);
            const resolvedCallback = resolveHookCallback(trait, callback);

            let data = getTraitInstance(ctx.traitInstances, resolvedTrait);

            if (!data) {
                registerTrait(ctx, resolvedTrait);
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
            ensureWorldRegistered(ctx, world, id);
            const resolvedTrait = resolveHookTrait(trait);
            const resolvedCallback = resolveHookCallback(trait, callback);

            if (!hasTraitInstance(ctx.traitInstances, resolvedTrait))
                registerTrait(ctx, resolvedTrait);

            const data = getTraitInstance(ctx.traitInstances, resolvedTrait)!;
            data.changeSubscriptions.add(resolvedCallback);

            ctx.trackedTraits.add(resolvedTrait);

            return () => {
                data.changeSubscriptions.delete(resolvedCallback);
                if (data.changeSubscriptions.size === 0) ctx.trackedTraits.delete(resolvedTrait);
            };
        },
    } as World;

    // Initialize entity index.
    world[$internal].entityIndex = createEntityIndex(universe.pageAllocator, world[$internal]);
    // Share ownedPages with the cleanup token so FR can reclaim pages.
    world[$internal].entityIndex.ownedPages = cleanupToken.ownedPages;

    // Register FR (only unobservable side effect of createWorld).
    universe.pageAllocator.worldFinalizer.register(world, cleanupToken, world);

    Object.defineProperty(world, 'traits', {
        get: () => world[$internal].traits,
        enumerable: true,
    });

    Object.defineProperty(world, 'id', {
        get: () => id,
        enumerable: true,
    });
    Object.defineProperty(world, 'isRegistered', {
        get: () => world[$internal].isRegistered,
        enumerable: true,
    });
    Object.defineProperty(world, 'entities', {
        get: () => getAliveEntities(world[$internal].entityIndex),
        enumerable: true,
    });

    // Auto-register when traits are passed. No-arg createWorld() stays pure.
    if (pendingTraits) {
        ensureWorldRegistered(world[$internal], world, id);
    }

    return world;
}
