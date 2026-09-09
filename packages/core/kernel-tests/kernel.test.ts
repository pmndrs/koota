import { afterEach, describe, expect, it } from 'vitest';
import {
  createKernelContext,
  initializeKernel,
  resetKernel,
  destroyKernel,
  releaseKernelResources,
  type KernelContext,
} from '../src/kernel/context';
import { createTrait } from '../src/kernel/trait/create-trait';
import { getTrait, hasTrait } from '../src/kernel/trait/trait';
import {
  createEntity,
  destroyEntity,
  removeTrait,
  setTrait,
  addTrait,
} from '../src/kernel/commands/operations';
import { createBufferState } from '../src/kernel/commands/buffer-state';
import { recordAdd, recordSpawn, recordSet } from '../src/kernel/commands/recording';
import { flushCommands } from '../src/kernel/commands/interpreter';
import { isEntityAlive } from '../src/kernel/entity/entity-index';
import { queryInternal } from '../src/kernel/query/query';
import { getTraitInstance } from '../src/kernel/trait/trait';
import { subscribeEntity } from '../src/kernel/trait/subscriptions';
import { universe } from '../src/kernel/universe';
import { getEntityId } from '../src/kernel/entity/pack-entity';

describe('Standalone kernel', () => {
  const contexts: KernelContext[] = [];
  function create() {
    const ctx = createKernelContext();
    contexts.push(ctx);
    initializeKernel(ctx);
    return ctx;
  }
  afterEach(() => {
    for (const ctx of contexts) destroyKernel(ctx);
    contexts.length = 0;
  });

  it('starts and resets empty, querying and notifying for every entity', () => {
    const ctx = create();
    const spawned: number[] = [];
    const destroyed: number[] = [];
    ctx.entitySpawnSubscriptions.add((entity) => spawned.push(entity));
    ctx.entityDestroySubscriptions.add((entity) => destroyed.push(entity));

    expect(ctx.entityIndex.ownedPages).toHaveLength(0);
    expect(ctx.traits.size).toBe(0);
    expect(queryInternal(ctx)).toEqual([]);
    const first = createEntity(ctx);
    const second = createEntity(ctx);
    expect(queryInternal(ctx)).toEqual([first, second]);
    destroyEntity(ctx, first);
    expect(queryInternal(ctx)).toEqual([second]);

    resetKernel(ctx);
    expect(queryInternal(ctx)).toEqual([]);
    expect(ctx.entityIndex.ownedPages).toHaveLength(0);
    expect(spawned).toEqual([first, second]);
    expect(destroyed).toEqual([first, second]);
  });

  it('applies caller-supplied query exclusions without suppressing lifecycle events', () => {
    const Hidden = createTrait();
    const ctx = createKernelContext([Hidden]);
    contexts.push(ctx);
    initializeKernel(ctx);
    const spawned: number[] = [];
    ctx.entitySpawnSubscriptions.add((entity) => spawned.push(entity));
    const visible = createEntity(ctx);
    const hidden = createEntity(ctx, Hidden);

    expect(queryInternal(ctx)).toEqual([visible]);
    expect(spawned).toEqual([visible, hidden]);
    removeTrait(ctx, hidden, Hidden);
    expect(queryInternal(ctx)).toEqual([visible, hidden]);
    addTrait(ctx, visible, Hidden);
    expect(queryInternal(ctx)).toEqual([hidden]);
  });

  it('mutates and queries numeric handles without installing entity methods', () => {
    expect(Object.hasOwn(Number.prototype, 'add')).toBe(false);
    const ctx = create();
    const Position = createTrait({ x: 0 });
    const entity = createEntity(ctx, Position);
    setTrait(ctx, entity, Position, { x: 3 });
    expect(getTrait(ctx, entity, Position)).toEqual({ x: 3 });
    const matches = queryInternal(ctx, Position);
    expect(matches).toEqual([entity]);
    expect(Object.hasOwn(matches, 'readEach')).toBe(false);
    removeTrait(ctx, entity, Position);
    expect(queryInternal(ctx, Position)).toEqual([]);
    destroyEntity(ctx, entity);
    expect(isEntityAlive(ctx.entityIndex, entity)).toBe(false);
  });

  it('plays plain buffers and drains mutations requested by hooks', () => {
    const ctx = create();
    const Ready = createTrait();
    const Position = createTrait(
      { x: 0 },
      {
        onAdd(value, entity) {
          value.x++;
          addTrait(ctx, entity, Ready);
          expect(hasTrait(ctx, entity, Ready)).toBe(false);
        },
      }
    );
    const buffer = createBufferState(ctx);
    const entity = recordSpawn(buffer, [Position, { x: 2 }]);
    expect(isEntityAlive(ctx.entityIndex, entity)).toBe(false);
    flushCommands(ctx, buffer);
    expect(getTrait(ctx, entity, Position)).toEqual({ x: 3 });
    expect(hasTrait(ctx, entity, Ready)).toBe(true);
    recordSet(buffer, entity, Position, { x: 7 });
    flushCommands(ctx, buffer);
    expect(getTrait(ctx, entity, Position)).toEqual({ x: 7 });
    expect(buffer.count).toBe(0);
  });

  it('keeps numeric subscription lifetimes separate from recycled entities', () => {
    const ctx = create();
    const Tag = createTrait();
    const entity = createEntity(ctx, Tag);
    const instance = getTraitInstance(ctx.traitInstances, Tag)!;
    ctx.entitySubscribedInstances.add(instance);
    const seen: number[] = [];
    const callback = (entity: number) => seen.push(entity);
    const unsubscribe = subscribeEntity(instance.addSubscriptions, entity, callback);
    removeTrait(ctx, entity, Tag);
    addTrait(ctx, entity, Tag);
    expect(seen).toEqual([entity]);
    destroyEntity(ctx, entity);
    const replacement = createEntity(ctx, Tag);
    ctx.entitySubscribedInstances.add(instance);
    subscribeEntity(instance.addSubscriptions, replacement, callback);
    unsubscribe();
    removeTrait(ctx, replacement, Tag);
    addTrait(ctx, replacement, Tag);
    expect(seen).toEqual([entity, replacement]);
  });

  it('resets its own state and releases pages on destruction', () => {
    const ctx = create();
    const Tag = createTrait();
    const entity = createEntity(ctx, Tag);
    const buffer = createBufferState(ctx);
    recordAdd(buffer, entity, Tag);
    resetKernel(ctx);
    expect(isEntityAlive(ctx.entityIndex, entity)).toBe(false);
    expect(queryInternal(ctx, Tag)).toEqual([]);
    expect(() => flushCommands(ctx, buffer)).toThrow(
      expect.objectContaining({ code: 'BUFFER_CONTEXT_EXPIRED' })
    );
    createEntity(ctx, Tag);
    destroyKernel(ctx);
    expect(ctx.entityIndex.ownedPages).toHaveLength(0);
    expect(ctx.isRegistered).toBe(false);
    expect('actionInstances' in ctx).toBe(false);
  });

  it('reports engine error codes when used without the public API', () => {
    const ctx = create();
    const other = create();
    const foreign = createBufferState(other);
    expect(() => flushCommands(ctx, foreign)).toThrow(
      expect.objectContaining({ code: 'BUFFER_CONTEXT_MISMATCH' })
    );
    const Guard = createTrait(undefined, {
      onAdd() {
        expect(() => resetKernel(ctx)).toThrow(
          expect.objectContaining({ code: 'CONTEXT_RESET_DURING_MUTATION' })
        );
        expect(() => destroyKernel(ctx)).toThrow(
          expect.objectContaining({ code: 'CONTEXT_DESTROY_DURING_MUTATION' })
        );
      },
    });
    createEntity(ctx, Guard);
    expect(queryInternal(ctx, Guard)).toHaveLength(1);
  });

  it('releases abandoned resources without hooks and invalidates handles before page reuse', () => {
    const ctx = create();
    let removed = 0;
    let destroyed = 0;
    const Resource = createTrait(undefined, {
      onRemove() {
        removed++;
      },
    });
    ctx.entityDestroySubscriptions.add(() => destroyed++);
    const entity = createEntity(ctx, Resource);
    const buffer = createBufferState(ctx);
    const token = ctx.cleanupToken;

    releaseKernelResources(token);
    expect(removed).toBe(0);
    expect(destroyed).toBe(0);
    expect(ctx.isRegistered).toBe(false);
    expect(token.contexts[token.contextId!]).toBeUndefined();
    expect(token.ownedPages).toHaveLength(0);
    expect(() => flushCommands(ctx, buffer)).toThrow(
      expect.objectContaining({ code: 'BUFFER_CONTEXT_EXPIRED' })
    );

    const freePages = token.allocator.freePages.length;
    releaseKernelResources(token);
    expect(token.allocator.freePages).toHaveLength(freePages);
    const replacementContext = create();
    const replacement = createEntity(replacementContext);
    expect(getEntityId(replacement)).toBe(getEntityId(entity));
    expect(replacement).not.toBe(entity);
    expect(isEntityAlive(replacementContext.entityIndex, entity)).toBe(false);
  });

  it('keeps delayed resource cleanup bound to its original allocator and registry', () => {
    const abandoned = create();
    createEntity(abandoned);
    const token = abandoned.cleanupToken;
    universe.reset();
    const current = create();
    const entity = createEntity(current);
    const pageId = getEntityId(entity) >>> 10;

    releaseKernelResources(token);
    expect(token.contexts[token.contextId!]).toBeUndefined();
    expect(abandoned.isRegistered).toBe(false);
    expect(universe.contexts[current.cleanupToken.contextId!]).toBe(current);
    expect(universe.pageOwners[pageId]).toBe(current);
    expect(universe.pageAllocator.pageAliveCounts[pageId]).toBe(1);
    expect(isEntityAlive(current.entityIndex, entity)).toBe(true);
  });
});
