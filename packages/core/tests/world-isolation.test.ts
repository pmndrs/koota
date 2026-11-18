import { describe, expect, it } from 'vitest';
import { createWorld, identifier, relation, trait, type Entity } from '../src';

describe('world isolation', () => {
  it.each(['source', 'target'] as const)(
    'keeps nested %s destruction cascades and their callbacks in their own worlds',
    (autoDestroy) => {
      const Link = relation({ autoDestroy });
      const Tag = trait();
      const a = createWorld();
      const b = createWorld();
      const first = [a.spawn(Tag), a.spawn(Tag), a.spawn(Tag)];
      const second = [b.spawn(Tag), b.spawn(Tag), b.spawn(Tag)];
      for (const entities of [first, second]) {
        for (let i = 1; i < entities.length; i++) {
          if (autoDestroy === 'source') entities[i].add(Link(entities[i - 1]));
          else entities[i - 1].add(Link(entities[i]));
        }
      }
      const seenA: Entity[] = [];
      const seenB: Entity[] = [];
      a.onEntityDestroy((entity) => {
        seenA.push(entity);
        if (entity !== first[0]) return;
        second[0].destroy();
        expect(b.query(Tag).length).toBe(0);
        expect(a.query(Tag).length).toBe(3);
      });
      b.onEntityDestroy((entity) => {
        seenB.push(entity);
        if (entity !== second[0]) return;
        // Returning to the first world joins its still-open scope.
        first[2].destroy();
        expect(first[2].isAlive()).toBe(true);
      });

      first[0].destroy();

      expect(seenA).toEqual(first);
      expect(seenB).toEqual(second);
      expect(a.query(Tag).length).toBe(0);
      expect(b.query(Tag).length).toBe(0);
      expect([...first, ...second].every((entity) => !entity.isAlive())).toBe(true);
      a.destroy();
      b.destroy();
    }
  );

  it('keeps a dying scope parent protected during and after a foreign hook throws', () => {
    const ChildOf = relation({ exclusive: true, autoDestroy: 'orphan' });
    const Name = identifier({ scope: ChildOf });
    const a = createWorld();
    const b = createWorld();
    const parent = a.spawn(Name('parent'));
    const child = a.spawn(ChildOf(parent), Name('child'));
    const foreign = b.spawn();
    const stop = b.onEntityDestroy(() => {
      expect(a.spawn(ChildOf(parent)).targetFor(ChildOf)).toBeUndefined();
      throw new Error('foreign hook');
    });
    a.onEntityDestroy((entity) => {
      if (entity !== parent) return;
      expect(() => foreign.destroy()).toThrow('foreign hook');
      expect(a.spawn(ChildOf(parent)).targetFor(ChildOf)).toBeUndefined();
    });

    parent.destroy();

    expect(parent.isAlive()).toBe(false);
    expect(child.isAlive()).toBe(false);
    expect(foreign.isAlive()).toBe(true);
    stop();
    foreign.destroy();
    expect(foreign.isAlive()).toBe(false);
    a.destroy();
    b.destroy();
  });

  it.each([0, 1024])(
    'destroys cyclic and duplicate cascade entries once with retain %s',
    (retain) => {
      const Link = relation({ autoDestroy: 'target' });
      const OtherLink = relation({ autoDestroy: 'target' });
      const world = createWorld({ retain });
      const seen: Entity[] = [];
      world.onEntityDestroy((entity) => seen.push(entity));

      for (let run = 0; run < 2; run++) {
        const parent = world.spawn();
        const child = world.spawn(Link(parent));
        parent.add(Link(child), OtherLink(child));
        seen.length = 0;

        parent.destroy();

        expect(seen).toEqual([parent, child]);
        expect(parent.isAlive()).toBe(false);
        expect(child.isAlive()).toBe(false);
        world.reset();
      }
      world.destroy();
    }
  );
});
