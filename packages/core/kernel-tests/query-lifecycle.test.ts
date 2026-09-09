import { afterEach, describe, expect, it } from 'vitest';
import * as kernel from '../src/kernel';
import type { RelationPair } from '../src/kernel/relation/types';
import { createKernelContext } from '../src/kernel/context';

const contexts: ReturnType<typeof createKernelContext>[] = [];
function create() {
  const ctx = createKernelContext();
  kernel.initializeKernel(ctx);
  contexts.push(ctx);
  return ctx;
}
afterEach(() => {
  for (const ctx of contexts) kernel.destroyKernel(ctx);
  contexts.length = 0;
});
function added(...traits: kernel.Trait[]) {
  const id = kernel.createTrackingId();
  return kernel.createModifier(`added-${id}`, id, traits);
}

function pair(relation: kernel.Relation, target: number | kernel.Trait): RelationPair {
  return typeof target === 'number'
    ? { [kernel.$relationPair]: true, relation, target }
    : { [kernel.$relationPair]: true, relation, targetQuery: [target] };
}

describe('kernel query lifetimes', () => {
  it('does not carry partial trackers across reused slots without exclusions', () => {
    const ctx = create();
    const A = kernel.createTrait();
    const B = kernel.createTrait();
    const selection = added(A, B);
    expect(kernel.queryInternal(ctx, selection)).toEqual([]);
    const old = kernel.createEntity(ctx, A);
    kernel.destroyEntity(ctx, old);
    const replacement = kernel.createEntity(ctx, B);
    expect(kernel.getEntityId(replacement)).toBe(kernel.getEntityId(old));
    expect(replacement).not.toBe(old);
    expect(kernel.queryInternal(ctx, selection)).toEqual([]);
    kernel.addTrait(ctx, replacement, A);
    expect(kernel.queryInternal(ctx, selection)).toEqual([replacement]);
  });

  it('resets every tracker generation when a partially matched entity is destroyed', () => {
    const ctx = create();
    const traits = Array.from({ length: 32 }, () => kernel.createTrait());
    for (const trait of traits) kernel.resolveDefinition(ctx, trait);
    const selection = added(traits[31], traits[0]);
    kernel.queryInternal(ctx, selection);
    const old = kernel.createEntity(ctx, traits[0]);
    kernel.destroyEntity(ctx, old);
    const replacement = kernel.createEntity(ctx, traits[31]);
    expect(kernel.queryInternal(ctx, selection)).toEqual([]);
    kernel.addTrait(ctx, replacement, traits[0]);
    expect(kernel.queryInternal(ctx, selection)).toEqual([replacement]);
  });

  it('does not seed a replacement from the destroyed entity history', () => {
    const ctx = create();
    const A = kernel.createTrait();
    const B = kernel.createTrait();
    kernel.resolveDefinition(ctx, A);
    kernel.resolveDefinition(ctx, B);
    const old = kernel.createEntity(ctx, A);
    const removed = kernel.createModifier('removed', kernel.createTrackingId(), [A]);
    const changed = kernel.createModifier('changed', kernel.createTrackingId(), [A]);
    kernel.setChanged(ctx, old, A);
    kernel.destroyEntity(ctx, old);
    const replacement = kernel.createEntity(ctx, B);
    expect(kernel.getEntityId(replacement)).toBe(kernel.getEntityId(old));
    expect(kernel.queryInternal(ctx, removed)).toEqual([]);
    expect(kernel.queryInternal(ctx, changed)).toEqual([]);
  });

  it('does not match static relation maintenance without a tracked event', () => {
    const ctx = create();
    const Value = kernel.createTrait();
    const Rel = kernel.createRelation();
    const target = kernel.createEntity(ctx);
    const selection = kernel.createModifier('changed', kernel.createTrackingId(), [Value]);
    kernel.queryInternal(ctx, selection, pair(Rel, target));
    const entity = kernel.createEntity(ctx, Value, pair(Rel, target));
    expect(kernel.queryInternal(ctx, selection, pair(Rel, target))).toEqual([]);
    kernel.setChanged(ctx, entity, Value);
    expect(kernel.queryInternal(ctx, selection, pair(Rel, target))).toEqual([entity]);
  });

  it('retries failed target-query construction without retaining subscriptions', () => {
    const ctx = create();
    const A = kernel.createTrait();
    const B = kernel.createTrait();
    const Left = kernel.createRelation();
    const Right = kernel.createRelation();
    const target = kernel.createEntity(ctx, A);
    const source = kernel.createEntity(ctx, pair(Left, target), pair(Right, target));
    const targetQuery = kernel.resolveQuery(ctx, [A]);
    // Failed construction has no public handle through which to observe retained subscriptions.
    const existing = ctx.queriesHashMap.get(kernel.createQuery(A).hash)!;
    const subscriptions = existing.internalAddSubscriptions.size;
    const stop = kernel.subscribeTraitRegistered(ctx, (trait) => {
      if (trait === B) throw new Error('Target registration failed');
    });
    const terms = [pair(Left, A), pair(Right, B)];
    expect(() => kernel.resolveQuery(ctx, terms)).toThrow('Target registration failed');
    stop();
    expect(existing.internalAddSubscriptions.size).toBe(subscriptions);
    kernel.addTrait(ctx, target, B);
    const query = kernel.resolveQuery(ctx, terms);
    expect(kernel.runQuery(ctx, query)).toEqual([source]);
    kernel.removeTrait(ctx, target, A);
    expect(kernel.runQuery(ctx, query)).toEqual([]);
    expect(kernel.runQuery(ctx, targetQuery)).toEqual([]);
  });

  it('filters implicit relation sources consistently with cached queries', () => {
    const ctx = create();
    const Implicit = kernel.createTrait();
    const Rel = kernel.createRelation();
    const target = kernel.createEntity(ctx, Implicit);
    const definition = ctx.traitInstances[Implicit[kernel.$internal].id]!.entity;
    const relation = kernel.resolveDefinition(ctx, Rel);
    const pairId = kernel.pairEntity(ctx, relation, target);
    kernel.attachEntity(ctx, definition, pairId);
    const source = kernel.createEntity(ctx, pair(Rel, target));
    expect(kernel.queryRelation(ctx, pair(Rel, target))).toEqual([source]);
    expect(kernel.queryInternal(ctx, pair(Rel, target))).toEqual([source]);
    kernel.exposeEntity(ctx, definition);
    expect(kernel.queryRelation(ctx, pair(Rel, target)).sort()).toEqual([source, definition].sort());
  });
});
