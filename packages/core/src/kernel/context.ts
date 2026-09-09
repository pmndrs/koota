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
import type { Relation } from './relation/types';
import type { Trait, TraitInstance } from './trait/types';

export type KernelContext = {
  mutationDepth: number;
  flushing: boolean;
  commandEpoch: number;
  pendingCommands: CommandBufferState | null;
  queryNotifications: [Set<(entity: Entity) => void>, Entity][];
  entityIndex: ReturnType<typeof createEntityIndex>;
  entityMasks: Uint32Array[][];
  entityTraits: Map<number, Set<Trait>>;
  bitflag: number;
  traitInstances: (TraitInstance | undefined)[];
  traits: Set<Trait>;
  relations: Set<Relation<Trait>>;
  queriesHashMap: Map<string, QueryInstance>;
  queryInstances: (QueryInstance | undefined)[];
  notQueries: Set<QueryInstance>;
  dirtyQueries: Set<QueryInstance>;
  dirtyMasks: Map<number, Uint32Array[][]>;
  trackingSnapshots: Map<number, Uint32Array[][]>;
  changedMasks: Map<number, Uint32Array[][]>;
  /** Default forbidden traits for queries in this context. */
  readonly queryExclusions?: readonly Trait[];
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
  };
  const ctx: KernelContext = {
    mutationDepth: 0,
    flushing: false,
    commandEpoch: 0,
    pendingCommands: null,
    queryNotifications: [],
    entityIndex: null! as ReturnType<typeof createEntityIndex>,
    entityMasks: [createEmptyMaskGeneration()],
    entityTraits: new Map(),
    bitflag: 1,
    traitInstances: [],
    traits: new Set<Trait>(),
    relations: new Set(),
    queriesHashMap: new Map(),
    queryInstances: [],
    notQueries: new Set(),
    dirtyQueries: new Set(),
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
  };
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
  ctx.dirtyQueries.clear();
  ctx.notQueries.clear();

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
