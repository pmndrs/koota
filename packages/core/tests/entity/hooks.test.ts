import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, relation, trait, type Entity } from '../../src';

const Position = trait({ x: 0, y: 0 });

describe('entity hooks', () => {
  // Disable destroyed-entity retention so ids can be reused on the next spawn.
  const world = createWorld({ retain: 0 });

  beforeEach(() => {
    world.reset();
  });

  describe('onEntitySpawn', () => {
    it('should fire every subscriber once for each spawned entity', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      world.onEntitySpawn(cb1);
      world.onEntitySpawn(cb2);

      const a = world.spawn();
      const b = world.spawn();
      const c = world.spawn();

      expect(cb1.mock.calls).toEqual([[a], [b], [c]]);
      expect(cb2.mock.calls).toEqual([[a], [b], [c]]);
    });

    it('should fire after traits are applied', () => {
      let hadPosition = false;
      world.onEntitySpawn((entity) => {
        hadPosition = entity.has(Position);
      });

      world.spawn(Position);
      expect(hadPosition).toBe(true);
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

    it.each(['onEntityDestroy', 'onRemove'] as const)(
      'should finish the cascade when an %s subscriber destroys another entity',
      (hook) => {
        const ChildOf = relation({ autoDestroy: 'orphan' });

        const parent = world.spawn(Position);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));
        const unrelated = world.spawn();

        const destroyUnrelated = (entity: Entity) => {
          if (entity === parent && world.has(unrelated)) unrelated.destroy();
        };
        const unsub =
          hook === 'onEntityDestroy'
            ? world.onEntityDestroy(destroyUnrelated)
            : world.onRemove(Position, destroyUnrelated);

        parent.destroy();
        unsub();

        expect(world.has(parent)).toBe(false);
        expect(world.has(unrelated)).toBe(false);
        expect(world.has(childA)).toBe(false);
        expect(world.has(childB)).toBe(false);
      }
    );

    it('should fire once per entity when a subscriber destroys a queued entity', () => {
      const ChildOf = relation({ autoDestroy: 'orphan' });

      const parent = world.spawn();
      const childA = world.spawn(ChildOf(parent));
      const childB = world.spawn(ChildOf(parent));

      const cb = vi.fn((entity: Entity) => {
        if (entity === parent && world.has(childA)) childA.destroy();
      });
      const unsub = world.onEntityDestroy(cb);

      parent.destroy();
      unsub();

      const destroyed = cb.mock.calls.map((c: any) => c[0]);
      expect(destroyed).toHaveLength(3);
      expect(destroyed).toContain(parent);
      expect(destroyed).toContain(childA);
      expect(destroyed).toContain(childB);
      expect(world.has(childA)).toBe(false);
      expect(world.has(childB)).toBe(false);
    });

    it('should not recurse when a subscriber destroys the entity being destroyed', () => {
      const cb = vi.fn((entity: Entity) => {
        entity.destroy();
      });
      const unsub = world.onEntityDestroy(cb);

      const entity = world.spawn(Position);
      try {
        entity.destroy();
      } finally {
        unsub();
      }

      expect(cb).toHaveBeenCalledOnce();
      expect(world.has(entity)).toBe(false);
      expect(world.spawn().id()).toBe(entity.id());
    });

    it('should leave an entity destroyable after a subscriber throws', () => {
      const unsub = world.onEntityDestroy(() => {
        throw new Error('boom');
      });

      const entity = world.spawn(Position);
      expect(() => entity.destroy()).toThrow('boom');
      unsub();

      expect(world.has(entity)).toBe(true);
      entity.destroy();
      expect(world.has(entity)).toBe(false);
    });
  });
});
