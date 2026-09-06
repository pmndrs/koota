import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $internal,
  createQuery,
  createWorld,
  relation,
  trait,
  type Entity,
  type TraitRecord,
} from '../src';

const Position = trait({ x: 0, y: 0 });
const Name = trait({ name: 'name' });
const Foo = trait();
const Bar = trait();
const Value = trait({ value: 0 });

describe('Lifecycle Subscriptions', () => {
  const world = createWorld();

  beforeEach(() => {
    world.reset();
  });

  describe('onAdd / onRemove', () => {
    it('can be subscribed for add and remove events', () => {
      const addCb = vi.fn((entity: Entity) => {
        expect(entity.get(Position)).toMatchObject({ x: 1, y: 2 });
      });

      const removeCb = vi.fn((entity: Entity) => {
        expect(entity.has(Position)).toBe(true);
        expect(entity.get(Position)).toMatchObject({ x: 1, y: 2 });
      });

      const entity = world.spawn();

      world.onAdd(Position, addCb);
      world.onRemove(Position, removeCb);

      entity.add(Position({ x: 1, y: 2 }));
      expect(addCb).toHaveBeenCalledTimes(1);

      entity.remove(Position);
      expect(removeCb).toHaveBeenCalledTimes(1);
    });

    it('calls onAdd after the trait is added with data', () => {
      const entity = world.spawn();

      world.onAdd(Position, (entity) => {
        expect(entity.get(Position)!.x).toBe(10);
      });

      entity.add(Position({ x: 10, y: 20 }));
    });
  });

  describe('onChange', () => {
    it('can subscribe to changes on a specific trait', () => {
      const entityA = world.spawn(Position);
      const entityB = world.spawn(Position);

      const cb = vi.fn();
      let unsub = world.onChange(Position, cb);

      entityA.set(Position, { x: 10, y: 20 });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(entityA);

      unsub();

      entityA.set(Position, { x: 20, y: 30 });

      expect(cb).toHaveBeenCalledTimes(1);

      entityA.changed(Name);

      expect(cb).toHaveBeenCalledTimes(1);

      // Test that subscribing to multiple entities with the same trait works.
      unsub = world.onChange(Position, cb);

      const cb2 = vi.fn();
      world.onChange(Position, cb2);

      entityB.set(Position, { x: 10, y: 20 });

      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledWith(entityB);

      // Remove one unsub to test that we don't accidentally remove trait tracking
      // for all callbacks associated with the trait.
      unsub();

      // Test changed detection with updateEach.
      world.query(Position).updateEach(([position]) => {
        position.x = 100;
      });

      // Increments by 2 because we are updating two entities.
      expect(cb2).toHaveBeenCalledTimes(3);
    });

    it('should trigger change events when trait state is set', () => {
      const entity = world.spawn(Value);
      let called = false;

      world.onChange(Value, () => {
        called = true;
      });

      entity.set(Value, { value: 1 });
      expect(called).toBe(true);

      // Can optionally suppress the event.
      called = false;
      entity.set(Value, { value: 2 }, false);
      expect(called).toBe(false);
    });

    it('should observe singleton traits', () => {
      const TimeOfDay = trait({ hour: 0 });
      const localWorld = createWorld(TimeOfDay);

      let timeOfDay: TraitRecord<typeof TimeOfDay> | undefined;
      localWorld.onChange(TimeOfDay, (e) => {
        timeOfDay = e.get(TimeOfDay);
      });

      localWorld.set(TimeOfDay, { hour: 1 });
      expect(timeOfDay).toEqual({ hour: 1 });

      localWorld.destroy();
    });

    it('does not fire onChange when a trait is added without or with initial data', () => {
      const cb = vi.fn();
      world.onChange(Position, cb);

      // Plain add — no initial data
      const entityA = world.spawn();
      entityA.add(Position);
      expect(cb).not.toHaveBeenCalled();

      // Add with inline initial data via trait ref
      const entityB = world.spawn();
      entityB.add(Position({ x: 1, y: 2 }));
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('entity.onAdd / onRemove / onChange', () => {
    it('only fires for the subscribed entity', () => {
      const entityA = world.spawn();
      const entityB = world.spawn();

      const addCb = vi.fn();
      const removeCb = vi.fn();
      const changeCb = vi.fn();
      entityA.onAdd(Position, addCb);
      entityA.onRemove(Position, removeCb);
      entityA.onChange(Position, changeCb);

      entityB.add(Position);
      entityB.set(Position, { x: 1, y: 1 });
      entityB.remove(Position);
      expect(addCb).not.toHaveBeenCalled();
      expect(changeCb).not.toHaveBeenCalled();
      expect(removeCb).not.toHaveBeenCalled();

      entityA.add(Position);
      entityA.set(Position, { x: 1, y: 1 });
      entityA.remove(Position);
      expect(addCb).toHaveBeenCalledWith(entityA);
      expect(changeCb).toHaveBeenCalledWith(entityA);
      expect(removeCb).toHaveBeenCalledWith(entityA);
    });

    it('fires alongside world subscribers and stops after unsubscribe', () => {
      const entity = world.spawn(Position);
      const worldCb = vi.fn();
      const entityCb = vi.fn();
      world.onChange(Position, worldCb);
      const unsub = entity.onChange(Position, entityCb);

      entity.set(Position, { x: 1, y: 1 });
      expect(worldCb).toHaveBeenCalledTimes(1);
      expect(entityCb).toHaveBeenCalledTimes(1);

      unsub();
      unsub();
      entity.set(Position, { x: 2, y: 2 });
      expect(worldCb).toHaveBeenCalledTimes(2);
      expect(entityCb).toHaveBeenCalledTimes(1);
    });

    it('enables change detection in updateEach', () => {
      const entity = world.spawn(Position);
      const cb = vi.fn();
      const unsub = entity.onChange(Position, cb);

      world.query(Position).updateEach(([position]) => {
        position.x = 5;
      });
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      world.query(Position).updateEach(([position]) => {
        position.x = 6;
      });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('drops subscribers when the entity is destroyed so a recycled id is clean', () => {
      const entity = world.spawn(Position);
      const cb = vi.fn();
      const unsub = entity.onChange(Position, cb);
      entity.destroy();

      const recycled = world.spawn(Position);
      expect(recycled.id()).toBe(entity.id());
      recycled.set(Position, { x: 1, y: 1 });
      expect(cb).not.toHaveBeenCalled();

      // Late unsubscribe after destroy is a safe no-op.
      unsub();
      const again = vi.fn();
      recycled.onChange(Position, again);
      recycled.set(Position, { x: 2, y: 2 });
      expect(again).toHaveBeenCalledTimes(1);
    });

    it('keeps tracking for new subscribers when a stale unsubscribe runs after reset', () => {
      const stale = world.spawn(Position).onChange(Position, vi.fn());
      world.reset();

      const entity = world.spawn(Position);
      const cb = vi.fn();
      entity.onChange(Position, cb);
      stale();

      world.query(Position).updateEach(([position]) => {
        position.x = 1;
      });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('counts a callback registered twice once', () => {
      const entity = world.spawn(Position);
      const cb = vi.fn();
      const unsubA = entity.onChange(Position, cb);
      const unsubB = entity.onChange(Position, cb);

      entity.set(Position, { x: 1, y: 1 });
      expect(cb).toHaveBeenCalledTimes(1);

      unsubA();
      unsubB();
      world.query(Position).updateEach(([position]) => {
        position.x = 2;
      });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('supports several subscribers on one entity and removes them independently', () => {
      const entity = world.spawn(Position);
      const a = vi.fn();
      const b = vi.fn();
      const c = vi.fn();
      const unsubA = entity.onChange(Position, a);
      const unsubB = entity.onChange(Position, b);
      const unsubC = entity.onChange(Position, c);

      entity.set(Position, { x: 1, y: 1 });
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(c).toHaveBeenCalledTimes(1);

      unsubB();
      entity.set(Position, { x: 2, y: 2 });
      expect(a).toHaveBeenCalledTimes(2);
      expect(b).toHaveBeenCalledTimes(1);
      expect(c).toHaveBeenCalledTimes(2);

      unsubA();
      unsubC();
      world.query(Position).updateEach(([position]) => {
        position.x = 3;
      });
      expect(a).toHaveBeenCalledTimes(2);
      expect(c).toHaveBeenCalledTimes(2);
    });

    it('ignores a late unsubscribe that shares a callback with a recycled id', () => {
      const cb = vi.fn();
      const stale = world.spawn(Position);
      const unsub = stale.onChange(Position, cb);
      stale.destroy();

      const recycled = world.spawn(Position);
      expect(recycled.id()).toBe(stale.id());
      recycled.onChange(Position, cb);
      unsub();

      recycled.set(Position, { x: 1, y: 1 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not invoke a listener removed or destroyed during dispatch', () => {
      const entity = world.spawn(Position);
      const removed = vi.fn();
      const unsub = entity.onChange(Position, removed);
      const worldUnsub = world.onChange(Position, () => unsub());

      entity.set(Position, { x: 1, y: 1 });
      expect(removed).not.toHaveBeenCalled();
      worldUnsub();

      const victim = world.spawn(Position);
      const late = vi.fn();
      victim.onChange(Position, () => victim.destroy());
      victim.onChange(Position, late);

      victim.set(Position, { x: 1, y: 1 });
      expect(late).not.toHaveBeenCalled();
    });

    it('registers nothing for a destroyed handle', () => {
      const dead = world.spawn();
      dead.destroy();

      const cb = vi.fn();
      const unsub = dead.onAdd(Position, cb);

      const recycled = world.spawn();
      expect(recycled.id()).toBe(dead.id());
      recycled.add(Position);
      expect(cb).not.toHaveBeenCalled();
      unsub();
    });

    it('does not deliver a dead generation event to a replacement on the same id', () => {
      const original = world.spawn(Position);
      const replacementCb = vi.fn();
      const worldUnsub = world.onChange(Position, (e) => {
        if (e !== original) return;
        e.destroy();
        const replacement = world.spawn(Position);
        expect(replacement.id()).toBe(original.id());
        replacement.onChange(Position, replacementCb);
      });

      original.set(Position, { x: 1, y: 1 });
      expect(replacementCb).not.toHaveBeenCalled();
      worldUnsub();
    });

    it('filters relation pairs by target', () => {
      const ChildOf = relation({ store: { priority: 0 } });
      const parentA = world.spawn();
      const parentB = world.spawn();
      const child = world.spawn();

      const pairCb = vi.fn();
      const relationCb = vi.fn();
      child.onAdd(ChildOf(parentA), pairCb);
      child.onChange(ChildOf, relationCb);

      child.add(ChildOf(parentB));
      expect(pairCb).not.toHaveBeenCalled();

      child.add(ChildOf(parentA));
      expect(pairCb).toHaveBeenCalledWith(child, parentA);

      child.set(ChildOf(parentB), { priority: 1 });
      expect(relationCb).toHaveBeenCalledWith(child, parentB);
    });

    it('works on the world entity', () => {
      const TimeOfDay = trait({ hour: 0 });
      const localWorld = createWorld(TimeOfDay);
      const cb = vi.fn();
      localWorld[$internal].worldEntity.onChange(TimeOfDay, cb);

      localWorld.set(TimeOfDay, { hour: 1 });
      expect(cb).toHaveBeenCalledTimes(1);

      localWorld.destroy();
    });
  });

  describe('onQueryAdd / onQueryRemove', () => {
    it('can be subscribed to for a stream of updates', () => {
      const event = { entity: 0 };
      const staticCb = vi.fn((entity) => {
        event.entity = entity;
      });

      // Static query subscriptions.
      const entity = world.spawn();

      // With a cache key.
      const queryKey = createQuery(Position, Foo);
      world.onQueryAdd(queryKey, staticCb);
      world.onQueryRemove(queryKey, staticCb);

      entity.add(Position);
      expect(staticCb).toHaveBeenCalledTimes(0);

      entity.add(Foo);
      expect(staticCb).toHaveBeenCalledTimes(1);
      expect(event.entity).toBe(entity);

      entity.remove(Foo);
      expect(staticCb).toHaveBeenCalledTimes(2);
      expect(event.entity).toBe(entity);

      // With parameters.
      world.onQueryAdd([Position, Bar], staticCb);
      world.onQueryRemove([Position, Bar], staticCb);

      entity.add(Position);
      expect(staticCb).toHaveBeenCalledTimes(2);

      entity.add(Bar);
      expect(staticCb).toHaveBeenCalledTimes(3);
      expect(event.entity).toBe(entity);

      entity.remove(Bar);
      expect(staticCb).toHaveBeenCalledTimes(4);
      expect(event.entity).toBe(entity);

      entity.remove(Position);
      expect(staticCb).toHaveBeenCalledTimes(4);
    });
  });

  describe('onEntitySpawn', () => {
    it('should fire when an entity is spawned', () => {
      const cb = vi.fn();
      world.onEntitySpawn(cb);

      const entity = world.spawn();
      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith(entity);
    });

    it('should fire after traits are applied', () => {
      let hadPosition = false;
      world.onEntitySpawn((entity) => {
        hadPosition = entity.has(Position);
      });

      world.spawn(Position);
      expect(hadPosition).toBe(true);
    });

    it('should fire for each spawned entity', () => {
      const cb = vi.fn();
      world.onEntitySpawn(cb);

      const a = world.spawn();
      const b = world.spawn();
      const c = world.spawn();

      expect(cb).toHaveBeenCalledTimes(3);
      expect(cb).toHaveBeenNthCalledWith(1, a);
      expect(cb).toHaveBeenNthCalledWith(2, b);
      expect(cb).toHaveBeenNthCalledWith(3, c);
    });

    it('should stop firing after unsubscribe', () => {
      const cb = vi.fn();
      const unsub = world.onEntitySpawn(cb);

      world.spawn();
      expect(cb).toHaveBeenCalledOnce();

      unsub();
      world.spawn();
      expect(cb).toHaveBeenCalledOnce();
    });

    it('should support multiple subscribers', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      world.onEntitySpawn(cb1);
      world.onEntitySpawn(cb2);

      const entity = world.spawn();
      expect(cb1).toHaveBeenCalledWith(entity);
      expect(cb2).toHaveBeenCalledWith(entity);
    });

    it('should persist across world.reset()', () => {
      const cb = vi.fn();
      world.onEntitySpawn(cb);

      world.spawn();
      expect(cb).toHaveBeenCalled();

      const countBeforeReset = cb.mock.calls.length;
      world.reset();

      world.spawn();
      expect(cb.mock.calls.length).toBeGreaterThan(countBeforeReset);
    });
  });

  describe('onEntityDestroy', () => {
    it('should fire when an entity is destroyed', () => {
      const cb = vi.fn();
      world.onEntityDestroy(cb);

      const entity = world.spawn();
      entity.destroy();

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith(entity);
    });

    it('should fire before traits are removed', () => {
      let hadPosition = false;
      world.onEntityDestroy((entity) => {
        hadPosition = entity.has(Position);
      });

      const entity = world.spawn(Position);
      entity.destroy();
      expect(hadPosition).toBe(true);
    });

    it('should fire for cascaded relation destroys', () => {
      const ChildOf = relation({ autoDestroy: 'orphan', exclusive: true });
      const cb = vi.fn();
      world.onEntityDestroy(cb);

      const parent = world.spawn();
      const child = world.spawn(ChildOf(parent));

      parent.destroy();

      expect(cb).toHaveBeenCalledTimes(2);
      const calledWith = cb.mock.calls.map((c: any) => c[0]);
      expect(calledWith).toContain(parent);
      expect(calledWith).toContain(child);
    });

    it('should stop firing after unsubscribe', () => {
      const cb = vi.fn();
      const unsub = world.onEntityDestroy(cb);

      const a = world.spawn();
      a.destroy();
      expect(cb).toHaveBeenCalledOnce();

      unsub();
      const b = world.spawn();
      b.destroy();
      expect(cb).toHaveBeenCalledOnce();
    });

    it('should fire during world.reset()', () => {
      const cb = vi.fn();
      world.onEntityDestroy(cb);

      world.spawn();
      world.spawn();
      world.spawn();

      world.reset();
      expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('onTraitRegistered', () => {
    it('should fire when a trait is first registered', () => {
      const cb = vi.fn();
      world.onTraitRegistered(cb);

      const Fresh = trait({ value: 0 });
      world.spawn(Fresh);

      expect(cb).toHaveBeenCalledWith(Fresh);
    });

    it('should not fire for already-registered traits', () => {
      world.spawn(Position);

      const cb = vi.fn();
      world.onTraitRegistered(cb);

      world.spawn(Position);
      const calls = cb.mock.calls.filter((c: any) => c[0] === Position);
      expect(calls.length).toBe(0);
    });

    it('should stop firing after unsubscribe', () => {
      const cb = vi.fn();
      const unsub = world.onTraitRegistered(cb);

      const A = trait();
      world.spawn(A);
      expect(cb).toHaveBeenCalledWith(A);

      unsub();
      const B = trait();
      world.spawn(B);
      const calls = cb.mock.calls.filter((c: any) => c[0] === B);
      expect(calls.length).toBe(0);
    });

    it('should fire for traits registered via world.onAdd', () => {
      const cb = vi.fn();
      world.onTraitRegistered(cb);

      const Fresh = trait({ x: 0 });
      world.onAdd(Fresh, () => {});

      expect(cb).toHaveBeenCalledWith(Fresh);
    });
  });
});
