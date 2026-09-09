import { createMembershipIndex } from './entity/membership';
import type { PairRecord } from './entity/definitions';
import type { PreparedAccess } from './entity/prepared-access';
import type { KernelContext as ContextHandle, PageCleanupToken as CleanupHandle } from './handles';
import { createKernelError } from './errors';
import { destroyEntity } from './commands/operations';
import { clearBuffer } from './commands/buffer-state';
import { getAliveEntities, isEntityAlive, releaseOwnedPages } from './entity/entity-index';
import { getTrackingCursor, setTrackingMasks } from './query/tracking-cursor';
import { clearTraitInstance } from './trait/trait';
import { universe } from './universe';
import { createEmptyMaskGeneration } from './entity/paged-mask';
import { releasePage, type PageCleanupToken } from './entity/page-allocator';
import type { CommandBufferState } from './commands/buffer-state';
import type { Entity } from './entity/types';
import { createEntityIndex } from './entity/entity-index';
import type { QueryInstance } from './query/types';
import type { Trait, TraitInstance } from './trait/types';

export type KernelContext = ContextHandle & {
  mutationDepth: number;
  iterationDepth: number;
  flushing: boolean;
  commandEpoch: number;
  pendingCommands: CommandBufferState | null;
  spareCommands: CommandBufferState | null;
  queryNotifications: (Set<(entity: Entity) => void> | undefined)[];
  queryNotificationEntities: Entity[];
  queryNotificationCount: number;
  entityIndex: ReturnType<typeof createEntityIndex>;
  entityMasks: Uint32Array[][];
  memberships: ReturnType<typeof createMembershipIndex>;
  definitions: Map<Entity, TraitInstance>;
  preparedAccesses: Map<Entity, PreparedAccess>;
  pairs: Map<Entity, PairRecord>;
  targetPairs: Map<Entity, PairRecord>;
  implicitEntities: Set<Entity>;
  destroyQueue: Entity[];
  destroyCount: number;
  bitflag: number;
  traitInstances: (TraitInstance | undefined)[];
  traits: Set<Trait>;
  queriesHashMap: Map<string, QueryInstance>;
  queryInstances: (QueryInstance | undefined)[];
  notQueries: Set<QueryInstance>;
  trackingQueries: Set<QueryInstance>;
  dirtyMasks: Map<number, Uint32Array[][]>;
  trackingSnapshots: Map<number, Uint32Array[][]>;
  changedMasks: Map<number, Uint32Array[][]>;
  /** Default forbidden traits for queries in this context. */
  readonly queryExclusions: readonly Trait[] | undefined;
  entitySubscribedInstances: Set<TraitInstance>;
  entitySpawnSubscriptions: Set<(entity: Entity) => void>;
  entityDestroySubscriptions: Set<(entity: Entity) => void>;
  traitRegisteredSubscriptions: Set<(trait: Trait) => void>;
  isRegistered: boolean;
  cleanupToken: PageCleanupToken;
};

let nextContextId = 0;

export function createKernelContext(queryExclusions?: readonly Trait[]): KernelContext {
  const cleanupToken: PageCleanupToken = {
    allocator: universe.pageAllocator,
    contexts: universe.contexts,
    ownedPages: [],
    registered: false,
    contextId: nextContextId++,
  } satisfies Omit<PageCleanupToken, keyof CleanupHandle> as unknown as PageCleanupToken;
  const ctx: KernelContext = {
    mutationDepth: 0,
    iterationDepth: 0,
    flushing: false,
    commandEpoch: 0,
    pendingCommands: null,
    spareCommands: null,
    queryNotifications: [],
    queryNotificationEntities: [],
    queryNotificationCount: 0,
    entityIndex: null! as ReturnType<typeof createEntityIndex>,
    entityMasks: [createEmptyMaskGeneration()],
    memberships: createMembershipIndex(),
    definitions: new Map(),
    preparedAccesses: new Map(),
    pairs: new Map(),
    targetPairs: new Map(),
    implicitEntities: new Set(),
    destroyQueue: [],
    destroyCount: 0,
    bitflag: 1,
    traitInstances: [],
    traits: new Set<Trait>(),
    queriesHashMap: new Map(),
    queryInstances: [],
    notQueries: new Set(),
    trackingQueries: new Set(),
    dirtyMasks: new Map(),
    trackingSnapshots: new Map(),
    changedMasks: new Map(),
    queryExclusions,
    entitySubscribedInstances: new Set(),
    entitySpawnSubscriptions: new Set(),
    entityDestroySubscriptions: new Set(),
    traitRegisteredSubscriptions: new Set(),
    isRegistered: false,
    cleanupToken,
  } satisfies Omit<KernelContext, keyof ContextHandle> as unknown as KernelContext;
  ctx.entityIndex = createEntityIndex(ctx.cleanupToken.allocator, ctx);
  ctx.entityIndex.ownedPages = cleanupToken.ownedPages;
  return ctx;
}

export function initializeKernel(ctx: KernelContext): void {
  if (ctx.isRegistered) return;
  ctx.isRegistered = true;
  ctx.cleanupToken.registered = true;

  ctx.cleanupToken.contexts[ctx.cleanupToken.contextId!] = ctx;

  const cursor = getTrackingCursor();
  for (let i = 0; i < cursor; i++) {
    setTrackingMasks(ctx, i);
  }
}

export function resetKernel(ctx: KernelContext): void {
  if (ctx.mutationDepth > 0 || ctx.flushing) throw createKernelError('CONTEXT_RESET_DURING_MUTATION');
  if (ctx.pendingCommands) clearBuffer(ctx.pendingCommands);
  ctx.pendingCommands = null;
  ctx.spareCommands = null;
  ctx.commandEpoch++;
  if (!ctx.isRegistered) return;

  getAliveEntities(ctx.entityIndex).forEach((entity) => {
    if (isEntityAlive(ctx.entityIndex, entity)) {
      destroyEntity(ctx, entity);
    }
  });

  releaseOwnedPages(ctx.entityIndex);
  ctx.entityIndex = createEntityIndex(ctx.cleanupToken.allocator, ctx);
  // Re-link shared ownedPages for the cleanup token.
  ctx.entityIndex.ownedPages = ctx.cleanupToken.ownedPages;

  ctx.memberships = createMembershipIndex();
  ctx.definitions.clear();
  ctx.preparedAccesses.clear();
  ctx.pairs.clear();
  ctx.targetPairs.clear();
  ctx.implicitEntities.clear();
  ctx.destroyCount = 0;
  ctx.entityMasks = [createEmptyMaskGeneration()];
  ctx.bitflag = 1;

  for (const query of ctx.queriesHashMap.values()) {
    for (let i = 0; i < query.cleanup.length; i++) {
      query.cleanup[i]();
    }
  }

  clearTraitInstance(ctx.traitInstances);
  ctx.traits.clear();

  ctx.queriesHashMap.clear();
  ctx.queryInstances.length = 0;
  ctx.notQueries.clear();
  ctx.trackingQueries.clear();

  ctx.trackingSnapshots.clear();
  ctx.dirtyMasks.clear();
  ctx.changedMasks.clear();
  ctx.entitySubscribedInstances.clear();
}

export function destroyKernel(ctx: KernelContext): void {
  if (ctx.mutationDepth > 0 || ctx.flushing)
    throw createKernelError('CONTEXT_DESTROY_DURING_MUTATION');
  resetKernel(ctx);
  ctx.isRegistered = false;
  ctx.cleanupToken.registered = false;
  delete ctx.cleanupToken.contexts[ctx.cleanupToken.contextId!];
}

/** Release abandoned resources without invoking trait hooks or subscriptions. */
export function releaseKernelResources(token: PageCleanupToken): void {
  if (!token.registered) return;
  const allocator = token.allocator;
  for (const pageId of token.ownedPages) {
    if (allocator.pageOwners[pageId]?.cleanupToken === token) releasePage(allocator, pageId);
  }
  token.ownedPages.length = 0;
  token.registered = false;

  if (token.contextId !== undefined) {
    const ctx = token.contexts[token.contextId];
    if (ctx?.cleanupToken === token) {
      ctx.isRegistered = false;
      ctx.commandEpoch++;
      delete token.contexts[token.contextId];
    }
  }
}

export function getKernelId(ctx: KernelContext): number {
  return ctx.cleanupToken.contextId!;
}

export function getKernelCleanupToken(ctx: KernelContext): PageCleanupToken {
  return ctx.cleanupToken;
}

export function isKernelInitialized(ctx: KernelContext): boolean {
  return ctx.isRegistered;
}

export function getKernelTraits(ctx: KernelContext): Set<Trait> {
  return ctx.traits;
}

export function getKernelEntities(ctx: KernelContext, includeDefinitions = false): Entity[] {
  const result: Entity[] = [];
  for (let i = 0; i < ctx.entityIndex.aliveCount; i++) {
    const entity = ctx.entityIndex.dense[i];
    if (includeDefinitions || !ctx.implicitEntities.has(entity)) result.push(entity);
  }
  return result;
}

export function subscribeEntityLifecycle(
  ctx: KernelContext,
  event: 'spawn' | 'destroy',
  callback: (entity: Entity) => void
): () => void {
  const subscriptions =
    event === 'spawn' ? ctx.entitySpawnSubscriptions : ctx.entityDestroySubscriptions;
  subscriptions.add(callback);
  return () => subscriptions.delete(callback);
}

export function subscribeTraitRegistered(
  ctx: KernelContext,
  callback: (trait: Trait) => void
): () => void {
  ctx.traitRegisteredSubscriptions.add(callback);
  return () => ctx.traitRegisteredSubscriptions.delete(callback);
}
