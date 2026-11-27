import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChanged,
  createWorld,
  identifier,
  relation,
  trait,
  type Entity,
  type Trait,
  type TraitRecord,
} from '../../src';

const Position = trait({ x: 0, y: 0 });
const Name = trait({ name: 'name' });

describe('trait hooks', () => {
  // Disable destroyed-entity retention so ids can be reused on the next spawn.
  const world = createWorld({ retain: 0 });

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

      expect(() => entityA.changed(Name)).toThrow(/\[TRAIT_PRESENT\]/);

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

      // Test changed detection with each.
      world.query(Position).each((position) => {
        position.x = 100;
      });

      // Increments by 2 because we are updating two entities.
      expect(cb2).toHaveBeenCalledTimes(3);
    });

    it('should observe singleton traits', () => {
      const TimeOfDay = trait({ hour: 0 });
      const localWorld = createWorld();
      localWorld.add(TimeOfDay);

      let timeOfDay: TraitRecord<typeof TimeOfDay> | undefined;
      localWorld.onChange(TimeOfDay, (e) => {
        timeOfDay = e.get(TimeOfDay);
      });

      localWorld.set(TimeOfDay, { hour: 1 });
      expect(timeOfDay).toEqual({ hour: 1 });

      localWorld.destroy();
    });

    it('fires onChange after additions and spawns have their initial data', () => {
      const cb = vi.fn();
      world.onChange(Position, (entity) => cb(entity, entity.get(Position)));

      const entityA = world.spawn();
      entityA.add(Position);
      const entityB = world.spawn();
      entityB.add(Position({ x: 1, y: 2 }));
      const entityC = world.spawn(Position({ x: 3, y: 4 }));
      entityA.add(Position({ x: 99 }));

      expect(cb.mock.calls).toEqual([
        [entityA, { x: 0, y: 0 }],
        [entityB, { x: 1, y: 2 }],
        [entityC, { x: 3, y: 4 }],
      ]);
    });

    it.each(['world', 'entity'] as const)(
      'aligns %s callbacks with Changed additions and writes without replaying existing values',
      (scope) => {
        const entity = world.spawn(Position({ x: 1 }));
        const Changed = createChanged();
        const values: number[] = [];
        const unsubscribe = (scope === 'world' ? world : entity).onChange(Position, (changed) => {
          values.push(changed.get(Position)!.x);
        });

        expect(values).toEqual([]);
        expect(world.query(Changed(Position)).toArray()).toEqual([entity]);
        expect(world.query(Changed(Position)).length).toBe(0);

        entity.remove(Position);
        expect(values).toEqual([]);
        expect(world.query(Changed(Position)).length).toBe(0);

        entity.add(Position({ x: 2 }));
        expect(values).toEqual([2]);
        expect(world.query(Changed(Position)).toArray()).toEqual([entity]);

        entity.set(Position, { x: 3 });
        expect(values).toEqual([2, 3]);
        expect(world.query(Changed(Position)).toArray()).toEqual([entity]);

        entity.changed(Position);
        expect(values).toEqual([2, 3, 3]);
        expect(world.query(Changed(Position)).toArray()).toEqual([entity]);

        world.query(Position).each((position) => position.x++);
        expect(values).toEqual([2, 3, 3, 4]);
        expect(world.query(Changed(Position)).toArray()).toEqual([entity]);

        entity.set(Position, { x: 5 }, false);
        expect(values).toEqual([2, 3, 3, 4]);
        expect(world.query(Changed(Position)).length).toBe(0);

        unsubscribe();
        entity.remove(Position);
        entity.add(Position);
        entity.set(Position, { x: 6 });
        expect(values).toEqual([2, 3, 3, 4]);
      }
    );
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

    it('drops subscribers when the entity is destroyed so a recycled id is clean', () => {
      const entity = world.spawn(Position);
      const cb = vi.fn();
      const unsub = entity.onChange(Position, cb);
      entity.destroy();

      const recycled = world.spawn(Position);
      expect(recycled.id()).toBe(entity.id());
      recycled.set(Position, { x: 1, y: 1 });
      expect(cb).not.toHaveBeenCalled();

      // A late unsubscribe is a safe no-op, even when the recycled id holds the same callback.
      recycled.onChange(Position, cb);
      unsub();
      const again = vi.fn();
      recycled.onChange(Position, again);
      recycled.set(Position, { x: 2, y: 2 });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(again).toHaveBeenCalledTimes(1);
    });

    it('keeps tracking for new subscribers when a stale unsubscribe runs after reset', () => {
      const stale = world.spawn(Position).onChange(Position, vi.fn());
      world.reset();

      const entity = world.spawn(Position);
      const cb = vi.fn();
      entity.onChange(Position, cb);
      stale();

      world.query(Position).each((position) => {
        position.x = 1;
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
      world.query(Position).each((position) => {
        position.x = 3;
      });
      expect(a).toHaveBeenCalledTimes(2);
      expect(c).toHaveBeenCalledTimes(2);
    });

    it('does not invoke a listener removed during dispatch', () => {
      const entity = world.spawn(Position);
      const removed = vi.fn();
      const unsub = entity.onChange(Position, removed);
      const worldUnsub = world.onChange(Position, () => unsub());

      entity.set(Position, { x: 1, y: 1 });
      expect(removed).not.toHaveBeenCalled();
      worldUnsub();
    });

    it('defers a destroy made during dispatch so later listeners still run', () => {
      const victim = world.spawn(Position);
      const late = vi.fn();
      victim.onChange(Position, () => victim.destroy());
      victim.onChange(Position, late);

      victim.set(Position, { x: 1, y: 1 });
      expect(late).toHaveBeenCalledExactlyOnceWith(victim);
      expect(victim.isAlive()).toBe(false);
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
  });

  describe('onTraitRegistered', () => {
    it('exposes every registered trait for entity inspection', () => {
      const Label = identifier();
      const Parent = relation();
      const Link = relation({ store: { weight: 0 } });
      const parent = world.spawn();
      const registered: Trait[] = [];
      world.onTraitRegistered((trait) => registered.push(trait));
      const entity = world.spawn(
        Position({ x: 3 }),
        Label('child'),
        Parent(parent),
        Link(parent, { weight: 5 })
      );

      const present = [...world.traits].filter((trait) => entity.has(trait));
      expect(present).toHaveLength(4);
      expect(new Set(present)).toEqual(new Set(registered));
      for (const trait of present) {
        expect(entity.get(trait)).toEqual(trait === Position ? { x: 3, y: 0 } : undefined);
      }
      expect(entity.targetFor(Label)).toBe('child');
      expect(entity.get(Link(parent))).toEqual({ weight: 5 });
    });

    it('should fire only when a trait is first registered', () => {
      world.spawn(Position);

      const cb = vi.fn();
      world.onTraitRegistered(cb);

      const Fresh = trait({ value: 0 });
      world.spawn(Fresh);
      world.spawn(Position);

      expect(cb).toHaveBeenCalledExactlyOnceWith(Fresh);
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
  });
});
