import * as visiting from './query/visit';
import * as prepared from './entity/prepared-access';
import * as plans from './query/query-plan';
import * as spawning from './entity/spawn-plan';
import * as context from './context';
import * as values from './entity/values';
import * as capacity from './entity/capacity';
import * as entityOperations from './entity/operations';
import * as entities from './entity/access';
import * as traits from './trait/trait';
import * as traitObservers from './trait/observe';
import * as relations from './relation/relation';
import * as queries from './query/query';
import * as queryObservers from './query/observe';
import * as iteration from './query/iteration';
import * as commands from './commands/operations';
import * as recording from './commands/recording';
import * as buffers from './commands/buffer-state';
import * as interpreter from './commands/interpreter';
import type { QueryInstance as EngineQuery } from './query/types';
import type { PageCleanupToken as EngineCleanup } from './entity/page-allocator';
import type { ExtractStore, Trait } from './trait/types';
import type {
  KernelContext,
  QueryInstance,
  CommandBufferState,
  PageCleanupToken,
  PreparedAccess,
  QueryPlan,
  QueryWorkspace,
  SpawnPlan,
} from './handles';

type HandleView<T> = T extends context.KernelContext
  ? KernelContext
  : T extends EngineQuery
    ? QueryInstance
    : T extends buffers.CommandBufferState
      ? CommandBufferState
      : T extends prepared.PreparedAccess
        ? PreparedAccess
        : T extends plans.QueryPlan
          ? QueryPlan
          : T extends visiting.QueryWorkspace
            ? QueryWorkspace
            : T extends spawning.SpawnPlan
              ? SpawnPlan
              : T extends EngineCleanup
                ? PageCleanupToken
                : T extends buffers.CommandBufferState[]
                  ? 0 extends 1 & T[number]
                    ? T
                    : CommandBufferState[]
                  : T;

/** Hide record layouts in signatures. These aliases use the original functions at runtime. */
type Operation<T> = T extends (...args: infer A) => infer R
  ? (...args: { [I in keyof A]: HandleView<A[I]> }) => HandleView<R>
  : never;

export const createKernelContext = context.createKernelContext as Operation<
  typeof context.createKernelContext
>;
export const initializeKernel = context.initializeKernel as Operation<
  typeof context.initializeKernel
>;
export const resetKernel = context.resetKernel as Operation<typeof context.resetKernel>;
export const destroyKernel = context.destroyKernel as Operation<typeof context.destroyKernel>;
export const releaseKernelResources = context.releaseKernelResources as Operation<
  typeof context.releaseKernelResources
>;
export const getKernelId = context.getKernelId as Operation<typeof context.getKernelId>;
export const getKernelCleanupToken = context.getKernelCleanupToken as unknown as Operation<
  typeof context.getKernelCleanupToken
>;
export const isKernelInitialized = context.isKernelInitialized as Operation<
  typeof context.isKernelInitialized
>;
export const getKernelTraits = context.getKernelTraits as Operation<typeof context.getKernelTraits>;
export const getKernelEntities = context.getKernelEntities as Operation<
  typeof context.getKernelEntities
>;
export const subscribeEntityLifecycle = context.subscribeEntityLifecycle as Operation<
  typeof context.subscribeEntityLifecycle
>;
export const subscribeTraitRegistered = context.subscribeTraitRegistered as Operation<
  typeof context.subscribeTraitRegistered
>;

export const getEntityContext = entities.getEntityContext as Operation<
  typeof entities.getEntityContext
>;
export const hasEntity = entities.hasEntity as Operation<typeof entities.hasEntity>;
export const isEntityHandleAlive = entities.isEntityHandleAlive as Operation<
  typeof entities.isEntityHandleAlive
>;
export const getTrait = traits.getTrait as Operation<typeof traits.getTrait>;
export const hasTrait = traits.hasTrait as Operation<typeof traits.hasTrait>;
export const getStore = traits.getStore as <T extends Trait>(
  ctx: KernelContext,
  trait: T
) => ExtractStore<T>;
export const subscribeTrait = traitObservers.subscribeTrait as Operation<
  typeof traitObservers.subscribeTrait
>;
export const getTraitVersionSource = traitObservers.getTraitVersionSource as Operation<
  typeof traitObservers.getTraitVersionSource
>;
export const getFirstRelationTarget = relations.getFirstRelationTarget as Operation<
  typeof relations.getFirstRelationTarget
>;
export const getRelationTargets = relations.getRelationTargets as Operation<
  typeof relations.getRelationTargets
>;
export const hasRelationPair = relations.hasRelationPair as Operation<
  typeof relations.hasRelationPair
>;
export const queryInternal = queries.queryInternal as Operation<typeof queries.queryInternal>;
export const runQuery = queries.runQuery as Operation<typeof queries.runQuery>;
export const resolveQuery = queryObservers.resolveQuery as unknown as Operation<
  typeof queryObservers.resolveQuery
>;
export const findQueryVersion = queryObservers.findQueryVersion as Operation<
  typeof queryObservers.findQueryVersion
>;
export const getQueryVersion = queryObservers.getQueryVersion as Operation<
  typeof queryObservers.getQueryVersion
>;
export const isTrackingQuery = queryObservers.isTrackingQuery as Operation<
  typeof queryObservers.isTrackingQuery
>;
export const subscribeQuery = queryObservers.subscribeQuery as Operation<
  typeof queryObservers.subscribeQuery
>;
export const queryRelation = queryObservers.queryRelation as Operation<
  typeof queryObservers.queryRelation
>;
export const getQueryStores = iteration.getQueryStores as Operation<typeof iteration.getQueryStores>;
export const readQueryEntities = iteration.readQueryEntities as Operation<
  typeof iteration.readQueryEntities
>;
export const updateQueryEntities = iteration.updateQueryEntities as Operation<
  typeof iteration.updateQueryEntities
>;
export const addTrait = commands.addTrait as Operation<typeof commands.addTrait>;
export const createEntity = commands.createEntity as Operation<typeof commands.createEntity>;
export const destroyEntity = commands.destroyEntity as Operation<typeof commands.destroyEntity>;
export const removeTrait = commands.removeTrait as Operation<typeof commands.removeTrait>;
export const setChanged = commands.setChanged as Operation<typeof commands.setChanged>;
export const setTrait = commands.setTrait as Operation<typeof commands.setTrait>;
export const recordAdd = recording.recordAdd as Operation<typeof recording.recordAdd>;
export const recordChanged = recording.recordChanged as Operation<typeof recording.recordChanged>;
export const recordDestroy = recording.recordDestroy as Operation<typeof recording.recordDestroy>;
export const recordRemove = recording.recordRemove as Operation<typeof recording.recordRemove>;
export const recordSet = recording.recordSet as Operation<typeof recording.recordSet>;
export const recordSpawn = recording.recordSpawn as Operation<typeof recording.recordSpawn>;
export const clearBuffer = buffers.clearBuffer as Operation<typeof buffers.clearBuffer>;
export const createBufferState = buffers.createBufferState as unknown as Operation<
  typeof buffers.createBufferState
>;
export const getCommandCount = buffers.getCommandCount as Operation<typeof buffers.getCommandCount>;
export const flushCommands = interpreter.flushCommands as Operation<typeof interpreter.flushCommands>;

export const defineTrait = entityOperations.defineTrait as Operation<
  typeof entityOperations.defineTrait
>;

export const defineRelation = entityOperations.defineRelation as Operation<
  typeof entityOperations.defineRelation
>;

export const resolveDefinition = entityOperations.resolveDefinition as Operation<
  typeof entityOperations.resolveDefinition
>;

export const exposeEntity = entityOperations.exposeEntity as Operation<
  typeof entityOperations.exposeEntity
>;

export const pairEntity = entityOperations.pairEntity as Operation<
  typeof entityOperations.pairEntity
>;

export const attachEntity = entityOperations.attachEntity as Operation<
  typeof entityOperations.attachEntity
>;

export const detachEntity = entityOperations.detachEntity as Operation<
  typeof entityOperations.detachEntity
>;

export const hasEntityTrait = entityOperations.hasEntityTrait as Operation<
  typeof entityOperations.hasEntityTrait
>;

export const readEntityTrait = entityOperations.readEntityTrait as Operation<
  typeof entityOperations.readEntityTrait
>;

export const writeEntityTrait = entityOperations.writeEntityTrait as Operation<
  typeof entityOperations.writeEntityTrait
>;

export const selectEntities = entityOperations.selectEntities as unknown as Operation<
  typeof entityOperations.selectEntities
>;

export const reserveEntityMemberships = entityOperations.reserveEntityMemberships as Operation<
  typeof entityOperations.reserveEntityMemberships
>;

export const collectQueryInto = queries.collectQueryInto as Operation<
  typeof queries.collectQueryInto
>;

export const reserveKernel = capacity.reserveKernel as Operation<typeof capacity.reserveKernel>;

export const tryCreateEntity = capacity.tryCreateEntity as Operation<typeof capacity.tryCreateEntity>;

export const tryAttachEntity = capacity.tryAttachEntity as Operation<typeof capacity.tryAttachEntity>;

export const readEntityValues = values.readEntityValues as Operation<typeof values.readEntityValues>;

export const writeEntityValues = values.writeEntityValues as Operation<
  typeof values.writeEntityValues
>;

export const visitQuery = visiting.visitQuery as Operation<typeof visiting.visitQuery>;

export const prepareEntityAccess = prepared.prepareEntityAccess as unknown as Operation<
  typeof prepared.prepareEntityAccess
>;
export const hasPreparedTrait = prepared.hasPreparedTrait as Operation<
  typeof prepared.hasPreparedTrait
>;
export const readPreparedValues = prepared.readPreparedValues as Operation<
  typeof prepared.readPreparedValues
>;
export const writePreparedValues = prepared.writePreparedValues as Operation<
  typeof prepared.writePreparedValues
>;
export const tryAttachPrepared = prepared.tryAttachPrepared as Operation<
  typeof prepared.tryAttachPrepared
>;
export const detachPrepared = prepared.detachPrepared as Operation<typeof prepared.detachPrepared>;
export const prepareQueryPlan = plans.prepareQueryPlan as unknown as Operation<
  typeof plans.prepareQueryPlan
>;
export const isQueryPlanValid = plans.isQueryPlanValid as Operation<typeof plans.isQueryPlanValid>;
export const collectQueryPlanInto = plans.collectQueryPlanInto as Operation<
  typeof plans.collectQueryPlanInto
>;
export const createQueryWorkspace = visiting.createQueryWorkspace as Operation<
  typeof visiting.createQueryWorkspace
>;
export const visitQueryPlan = visiting.visitQueryPlan as Operation<typeof visiting.visitQueryPlan>;
export const visitQueryColumns = visiting.visitQueryColumns as Operation<
  typeof visiting.visitQueryColumns
>;
export const prepareSpawnPlan = spawning.prepareSpawnPlan as unknown as Operation<
  typeof spawning.prepareSpawnPlan
>;
export const trySpawnBatch = spawning.trySpawnBatch as Operation<typeof spawning.trySpawnBatch>;
export type { ValueColumn } from './entity/prepared-access';
export type { QueryPlanOptions } from './query/query-plan';
export type { ColumnPublication } from './query/visit';
