import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuery, createWorld, Or, relation, trait } from '../../src';

const Position = trait({ x: 0, y: 0 });
const Foo = trait();
const Bar = trait();
const Value = trait({ value: 0 });

describe('query hooks', () => {
  // Disable destroyed-entity retention so ids can be reused on the next spawn.
  const world = createWorld({ retain: 0 });

  beforeEach(() => {
    world.reset();
  });

  describe('onEnter / onExit', () => {
    it.each(['add', 'remove'] as const)(
      'updates every query when a subscriber destroys its relation target during %s',
      (event) => {
        const Tag = trait();
        const ChildOf = relation();
        const parent = world.spawn();
        const child = world.spawn(ChildOf(parent));
        if (event === 'remove') child.add(Tag);
        const on = event === 'add' ? 'onEnter' : 'onExit';
        const notified = vi.fn();
        world[on]([Tag, ChildOf(parent)], () => parent.destroy());
        world[on]([Tag], notified);

        child[event](Tag);

        expect(world.query(Tag).toArray()).toEqual(event === 'add' ? [child] : []);
        expect(notified.mock.calls).toEqual([[child]]);
      }
    );

    it('can be subscribed to for a stream of updates', () => {
      const event = { entity: 0 };
      const staticCb = vi.fn((entity) => {
        event.entity = entity;
      });

      // Static query subscriptions.
      const entity = world.spawn();

      // With a cache key.
      const queryKey = createQuery(Position, Foo);
      world.onEnter(queryKey, staticCb);
      world.onExit(queryKey, staticCb);

      entity.add(Position);
      expect(staticCb).toHaveBeenCalledTimes(0);

      entity.add(Foo);
      expect(staticCb).toHaveBeenCalledTimes(1);
      expect(event.entity).toBe(entity);

      entity.remove(Foo);
      expect(staticCb).toHaveBeenCalledTimes(2);
      expect(event.entity).toBe(entity);

      // With parameters.
      world.onEnter([Position, Bar], staticCb);
      world.onExit([Position, Bar], staticCb);

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

    it('calls onEnter after the traits are added with data', () => {
      const values: number[] = [];
      world.onEnter([Position], (entity) => values.push(entity.get(Position)!.x));
      world.onEnter([Position, Value], (entity) => values.push(entity.get(Value)!.value));

      world.spawn(Position({ x: 10, y: 20 }), Value({ value: 5 }));
      const entity = world.spawn();
      entity.add(Position({ x: 11, y: 21 }));

      expect(values).toEqual([10, 5, 11]);
    });

    it('reports an entity once while it keeps matching in more than one way', () => {
      const Link = relation();
      const events: string[] = [];
      const either = world.spawn();
      world.onEnter([Or(Foo, Bar)], () => events.push('or enter'));
      world.onExit([Or(Foo, Bar)], () => events.push('or exit'));

      either.add(Foo);
      either.add(Bar);
      either.remove(Foo);
      either.remove(Bar);
      expect(events.splice(0)).toEqual(['or enter', 'or exit']);

      const first = world.spawn();
      const second = world.spawn();
      world.spawn(Link(first), Link(second));
      world.onEnter([Link(Position)], () => events.push('filter enter'));
      world.onExit([Link(Position)], () => events.push('filter exit'));

      first.add(Position);
      second.add(Position);
      first.remove(Position);
      second.remove(Position);
      expect(events).toEqual(['filter enter', 'filter exit']);
    });
  });
});
