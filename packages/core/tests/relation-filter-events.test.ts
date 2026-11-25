import { describe, expect, it } from 'vitest';
import {
  createAdded,
  createChanged,
  createRemoved,
  createWorld,
  relation,
  trait,
  type Entity,
} from '../src';

describe('relation filter events', () => {
  const Active = trait();
  const ChildOf = relation();

  it('reports a target entering and leaving the filter through hooks', () => {
    const world = createWorld();
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));
    const stranger = world.spawn(ChildOf(world.spawn()));
    const events: [string, Entity, Entity][] = [];
    world.onAdd(ChildOf(Active), (entity, target) => events.push(['world add', entity, target]));
    world.onRemove(ChildOf(Active), (entity, target) =>
      events.push(['world remove', entity, target])
    );
    child.onAdd(ChildOf(Active), (entity, target) => events.push(['add', entity, target]));
    child.onRemove(ChildOf(Active), (entity, target) => events.push(['remove', entity, target]));
    stranger.onAdd(ChildOf(Active), () => events.push(['stranger', stranger, parent]));

    parent.add(Active);
    expect(events.splice(0)).toEqual([
      ['world add', child, parent],
      ['add', child, parent],
    ]);

    parent.remove(Active);
    expect(events.splice(0)).toEqual([
      ['world remove', child, parent],
      ['remove', child, parent],
    ]);
  });

  it('reports each pair once when the pair or its target is removed or destroyed', () => {
    const world = createWorld();
    const parent = world.spawn(Active);
    const child = world.spawn();
    const events: string[] = [];
    child.onAdd(ChildOf(Active), () => events.push('add'));
    child.onRemove(ChildOf(Active), () => events.push('remove'));

    child.add(ChildOf(parent));
    child.remove(ChildOf(parent));
    child.add(ChildOf(parent));
    parent.destroy();

    expect(events).toEqual(['add', 'remove', 'add', 'remove']);
  });

  it('reports every source when a hook changes the relation as its target enters', () => {
    const world = createWorld();
    const parent = world.spawn();
    const children = [world.spawn(ChildOf(parent)), world.spawn(ChildOf(parent))];
    const late = world.spawn();
    const reported: Entity[] = [];
    world.onAdd(ChildOf(Active), (entity) => {
      reported.push(entity);
      children[0].remove(ChildOf(parent));
      late.add(ChildOf(parent));
    });

    parent.add(Active);

    expect(reported).toEqual([...children, late]);
    expect(world.query(ChildOf(Active)).toArray()).toEqual([children[1], late]);
  });

  it('stops reporting after unsubscribing', () => {
    const world = createWorld();
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));
    let events = 0;
    const stopWorld = world.onAdd(ChildOf(Active), () => events++);
    const stopEntity = child.onAdd(ChildOf(Active), () => events++);
    stopWorld();
    stopEntity();
    parent.add(Active);
    expect(events).toBe(0);
  });

  it('reports a target change to tracking queries as it reports the same pair change', () => {
    const run = (mode: 'pair' | 'target') => {
      const Added = createAdded();
      const Removed = createRemoved();
      const Changed = createChanged();
      const world = createWorld();
      const parent = world.spawn();
      const child = world.spawn();
      world.spawn(ChildOf(world.spawn()));
      if (mode === 'pair') parent.add(Active);
      else child.add(ChildOf(parent));
      const on = () => (mode === 'pair' ? child.add(ChildOf(parent)) : parent.add(Active));
      const off = () => (mode === 'pair' ? child.remove(ChildOf(parent)) : parent.remove(Active));
      const read = () => [
        world
          .query(Added(ChildOf(Active)))
          .toArray()
          .map((entity) => entity === child),
        world
          .query(Removed(ChildOf(Active)))
          .toArray()
          .map((entity) => entity === child),
        world
          .query(Changed(ChildOf(Active)))
          .toArray()
          .map((entity) => entity === child),
      ];
      read();
      const reads = [];
      on();
      reads.push(read());
      off();
      reads.push(read());
      on();
      off();
      reads.push(read());
      on();
      read();
      off();
      on();
      reads.push(read());
      return reads;
    };

    const byTarget = run('target');
    expect(byTarget).toEqual(run('pair'));
    // The first change is an add and the second a remove.
    expect(byTarget[0]).toEqual([[true], [], [true]]);
    expect(byTarget[1]).toEqual([[], [true], []]);
  });
});
