import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createAdded,
  createChanged,
  createQuery,
  createRemoved,
  createWorld,
  identifier,
  IsExcluded,
  Not,
  Or,
  relation,
  trait,
  type Entity,
  type World,
} from '../../src';

describe('Identifiers', () => {
  const Name = identifier();
  const WireId = identifier<number>();
  const Position = trait({ x: 0 });
  let world: World;

  beforeEach(() => {
    world = createWorld();
  });
  afterEach(() => {
    world.destroy();
  });

  it('resolves multiple identifier types in both directions', () => {
    expect(world.lookup(Name('kris'))).toBeUndefined();
    expect(world.lookupAll(Name('kris'))).toEqual([]);
    const player = world.spawn(Name('kris'), WireId(123), Position);
    expect(world.lookup(Name('kris'))).toBe(player);
    expect(world.lookupAll(Name('kris'))).toEqual([player]);
    expect(world.lookup(WireId(123))).toBe(player);
    expect(player.has(Name('kris'))).toBe(true);
    expect(player.has(WireId(123))).toBe(true);
    expect(player.targetFor(Name)).toBe('kris');
    expect(player.targetsFor(WireId)).toEqual([123]);
    expectTypeOf(player.targetFor(Name)).toEqualTypeOf<string | undefined>();
    expectTypeOf(player.targetFor(WireId)).toEqualTypeOf<number | undefined>();
    expectTypeOf(world.lookup(WireId(123))).toEqualTypeOf<Entity | undefined>();
    world.query(Name('kris'), WireId(123), Position).each((position, entity) => {
      expectTypeOf(position).toEqualTypeOf<{ x: number }>();
      expectTypeOf(entity).toEqualTypeOf<Entity>();
      position.x = 7;
    });
    expect(player.get(Position)).toEqual({ x: 7 });
  });

  it('keeps namespaces separate by identifier type, key type and world', () => {
    const First = identifier<string | number>();
    const Second = identifier<string | number>();
    const Shared = identifier<string | number>({ exclusive: false });
    const other = createWorld();
    try {
      const text = world.spawn(First('42'), Second(42), Shared(42));
      const number = world.spawn(First(42), Second('42'), Shared(42));
      const shared = world.spawn(Shared('42'));
      const elsewhere = other.spawn(First('42'), Shared(42));
      expect(world.lookup(First('42'))).toBe(text);
      expect(world.lookup(First(42))).toBe(number);
      expect(world.lookup(Second(42))).toBe(text);
      expect(other.lookup(First('42'))).toBe(elsewhere);
      expect(world.lookupAll(Shared(42))).toEqual([text, number]);
      expect(world.lookupAll(Shared('42'))).toEqual([shared]);
      expect(world.lookupAll(Second(42))).toEqual([text]);
      // A key shared under one identifier stays unique under another.
      expect(() => number.add(Second(42))).toThrow(/IDENTIFIER_TAKEN/);
      expect(world.query(createQuery(First('42'))).toArray()).toEqual([text]);
      expect(world.query(createQuery(First(42))).toArray()).toEqual([number]);
      expect(world.query(createQuery(Second('42'))).toArray()).toEqual([number]);
      world.reset();
      expect(world.lookupAll(Shared(42))).toEqual([]);
      expect(other.lookup(First('42'))).toBe(elsewhere);
      expect(other.lookupAll(Shared(42))).toEqual([elsewhere]);
    } finally {
      other.destroy();
    }
  });

  it('composes terms by intersection in inline and cached queries', () => {
    const first = world.spawn(Name('first'), WireId(1), Position);
    const second = world.spawn(Name('second'), WireId(2));
    for (const terms of [
      [Name('first'), WireId(1), Position],
      [WireId(1), Position, Name('first')],
      [Name('first'), WireId, Position],
      [Name('first'), Name('first')],
    ]) {
      expect(world.query(...terms).toArray()).toEqual([first]);
      expect(world.query(createQuery(...terms)).toArray()).toEqual([first]);
    }
    for (const terms of [
      [Name('first'), WireId(2)],
      [Name('first'), Name('second')],
    ]) {
      expect(world.queryFirst(...terms)).toBeUndefined();
      expect(world.query(createQuery(...terms))).toHaveLength(0);
    }
    expect(world.query(Name, WireId).toArray()).toEqual([first, second]);
    expect(world.queryFirst(Name('first'), Position)).toBe(first);
    expect(world.query(Name('second'), Position)).toHaveLength(0);
    expect(world.query(Name('second'), Not(Position)).toArray()).toEqual([second]);
    expect(world.query(Not(Name))).toHaveLength(0);
    expect(world.query(Or(Name, WireId)).toArray()).toEqual([first, second]);
  });

  it.each([
    { order: 'first', exclusive: true },
    { order: 'last', exclusive: true },
    { order: 'first', exclusive: false },
    { order: 'last', exclusive: false },
  ])(
    'initializes tracking queries when a missing identifier comes $order with exclusive: $exclusive',
    ({ order, exclusive }) => {
      const Name = identifier({ exclusive });
      const Changed = createChanged();
      const terms =
        order === 'first' ? [Name('late'), Changed(Position)] : [Changed(Position), Name('late')];
      expect(world.query(...terms)).toHaveLength(0);

      const player = world.spawn(Position);
      player.add(Name('late'));
      expect(world.query(...terms)).toHaveLength(0);

      player.set(Position, { x: 1 });
      expect(world.query(...terms).toArray()).toEqual([player]);
    }
  );

  it('replaces an assignment atomically and treats an identical assignment as a no-op', () => {
    const player = world.spawn(Name('kris'), WireId(1));
    const added = vi.fn();
    const removed = vi.fn();
    const changed = vi.fn();
    player.onAdd(WireId, added);
    player.onRemove(WireId, removed);
    player.onChange(WireId, changed);
    player.add(WireId(1));
    expect(added).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    player.onRemove(WireId(1), () => {
      expect(world.lookup(WireId(1))).toBeUndefined();
      expect(world.lookup(WireId(2))).toBe(player);
      expect(player.targetFor(WireId)).toBe(2);
    });
    player.add(WireId(2));
    expect(removed.mock.calls).toEqual([[player, 1]]);
    expect(added.mock.calls).toEqual([[player, 2]]);
    expect(changed.mock.calls).toEqual([[player, 2]]);
    expect(world.lookup(Name('kris'))).toBe(player);
    expect(world.spawn(WireId(1)).targetFor(WireId)).toBe(1);
  });

  it('refuses collisions without changing mappings, queries or events', () => {
    const owner = world.spawn(WireId(1));
    const challenger = world.spawn(WireId(2));
    const unassigned = world.spawn();
    const query = createQuery(WireId(2));
    const changed = vi.fn();
    world.onAdd(WireId, changed);
    world.onRemove(WireId, changed);
    world.onExit(query, changed);
    expect(() => world.spawn(WireId(1))).toThrow(/IDENTIFIER_TAKEN/);
    expect(() => challenger.add(WireId(1))).toThrow(/IDENTIFIER_TAKEN/);
    expect(() => unassigned.add(WireId(1))).toThrow(/IDENTIFIER_TAKEN/);
    expect(world.lookup(WireId(1))).toBe(owner);
    expect(world.lookup(WireId(2))).toBe(challenger);
    expect(challenger.targetFor(WireId)).toBe(2);
    expect(unassigned.has(WireId)).toBe(false);
    expect(world.query(query).toArray()).toEqual([challenger]);
    expect(changed).not.toHaveBeenCalled();
  });

  it('removes only matching terms and frees keys through destruction and reset', () => {
    // Disable destroyed-entity retention so the id is reused on the next spawn.
    world.destroy();
    world = createWorld({ retain: 0 });
    const query = createQuery(Name('kris'), WireId(1));
    const player = world.spawn(Name('kris'), WireId(1));
    player.remove(WireId(2));
    expect(world.query(query).toArray()).toEqual([player]);
    player.remove(WireId(1));
    expect(player.targetFor(WireId)).toBeUndefined();
    expect(player.targetsFor(WireId)).toEqual([]);
    expect(world.lookup(Name('kris'))).toBe(player);
    player.add(WireId(1));
    player.destroy();
    const replacement = world.spawn(Name('kris'), WireId(1));
    expect(replacement.id()).toBe(player.id());
    expect(world.query(query).toArray()).toEqual([replacement]);
    world.reset();
    expect(world.lookup(Name('kris'))).toBeUndefined();
    expect(world.lookup(WireId(1))).toBeUndefined();
    expect(world.query(query)).toHaveLength(0);
    const next = world.spawn(Name('kris'), WireId(1));
    expect(world.query(query).toArray()).toEqual([next]);
  });

  it('keeps inline and cached queries and their subscriptions current as keys move', () => {
    const query = createQuery(Name('kris'), WireId(1), Position);
    const inline = world.query(Name('kris'), Position);
    const added = vi.fn();
    const removed = vi.fn();
    world.onEnter(query, added);
    world.onExit(query, removed);
    const player = world.spawn(Name('kris'), WireId(1));
    expect(added).not.toHaveBeenCalled();
    expect(inline.toArray()).toEqual([]);
    player.add(Position);
    expect(inline.toArray()).toEqual([player]);
    player.add(WireId(2));
    expect(world.query(query)).toHaveLength(0);
    player.add(WireId(1));
    expect(world.queryFirst(query)).toBe(player);
    player.remove(Name);
    expect(added.mock.calls).toEqual([[player], [player]]);
    expect(removed.mock.calls).toEqual([[player], [player]]);

    // Each key has its own cached query that follows the key to its next owner.
    const first = createQuery(WireId(1));
    const second = createQuery(WireId(2));
    const next = world.spawn(Name('kris'), WireId(2), Position);
    expect(inline.toArray()).toEqual([next]);
    expect(world.queryFirst(first)).toBe(player);
    expect(world.queryFirst(second)).toBe(next);
    player.add(WireId(3));
    next.add(WireId(1));
    expect(world.query(first).toArray()).toEqual([next]);
    expect(world.query(second)).toHaveLength(0);
    next.remove(Position);
    expect(inline.toArray()).toEqual([]);
    next.destroy();
    expect(world.query(first)).toHaveLength(0);
  });

  it('resolves entity relation targets using composed and shared identifier terms', () => {
    const DisplayName = identifier({ exclusive: false });
    const ChildOf = relation();
    const first = world.spawn(Name('kris'), WireId(1), DisplayName('kris'));
    const second = world.spawn(Name('other'), WireId(2), DisplayName('kris'));
    const firstChild = world.spawn(Position, ChildOf(first));
    const secondChild = world.spawn(Position, ChildOf(second));
    const query = createQuery(Position, ChildOf(Name('kris'), WireId(1)));
    const shared = createQuery(ChildOf(DisplayName('kris')));
    expect(world.query(query).toArray()).toEqual([firstChild]);
    expect(world.query(shared).toArray()).toEqual([firstChild, secondChild]);
    first.remove(Name, WireId);
    second.add(Name('kris'), WireId(1));
    expect(world.query(query).toArray()).toEqual([secondChild]);

    // A shared name selects the children of every owner and follows each rename.
    second.add(DisplayName('sam'));
    expect(world.query(shared).toArray()).toEqual([firstChild]);
    first.remove(DisplayName);
    expect(world.query(shared)).toHaveLength(0);
    second.add(DisplayName('kris'));
    expect(world.query(shared).toArray()).toEqual([secondChild]);
  });

  it('treats numeric keys as values even when they equal a live entity handle', () => {
    const target = world.spawn();
    const owner = world.spawn(WireId(target));
    const query = createQuery(WireId(target));
    expect(world.query(query).toArray()).toEqual([owner]);
    target.destroy();
    expect(world.lookup(WireId(target))).toBe(owner);
    expect(world.query(query).toArray()).toEqual([owner]);
  });

  it('uses exact scalar equality including empty strings, literal wildcards and zero', () => {
    const Key = identifier<string | number>();
    for (const key of ['', '*', '1:s:2|3:four', 0, '0']) {
      const entity = world.spawn(Key(key));
      expect(entity.has(Key(key))).toBe(true);
      expect(world.lookup(Key(key))).toBe(entity);
      expect(world.query(createQuery(Key(key))).toArray()).toEqual([entity]);
    }
    expect(world.lookup(Key(-0))).toBe(world.lookup(Key(0)));
    const removed = vi.fn();
    world.onRemove(Key('*'), removed);
    world.lookup(Key(''))!.remove(Key(''));
    expect(removed).not.toHaveBeenCalled();
    const star = world.lookup(Key('*'))!;
    star.remove(Key('*'));
    expect(removed.mock.calls).toEqual([[star, '*']]);
  });

  it('tracks presence and replacement with the existing modifiers', () => {
    const Added = createAdded();
    const Removed = createRemoved();
    const Changed = createChanged();
    const added = createQuery(Added(WireId));
    const removed = createQuery(Removed(WireId));
    const changed = createQuery(Changed(WireId));
    world.query(added);
    world.query(removed);
    world.query(changed);
    const changes = vi.fn();
    const exact = vi.fn();
    world.onChange(WireId, changes);
    world.onChange(WireId(2), exact);
    const player = world.spawn(WireId(1));
    expect(world.query(added).toArray()).toEqual([player]);
    expect(world.query(changed).toArray()).toEqual([player]);
    expect(changes.mock.calls).toEqual([[player, 1]]);
    player.add(WireId(2));
    expect(world.query(added)).toHaveLength(0);
    expect(world.query(changed).toArray()).toEqual([player]);
    expect(changes.mock.calls).toEqual([
      [player, 1],
      [player, 2],
    ]);
    expect(exact.mock.calls).toEqual([[player, 2]]);
    player.remove(WireId(2));
    expect(world.query(removed).toArray()).toEqual([player]);
  });

  it('frees a key when its owner is destroyed while the entity is still retained', () => {
    const Removed = createRemoved();
    world.query(Removed(Name));
    const query = createQuery(Name('kris'));
    const removed = vi.fn();
    world.onRemove(Name, removed);
    const player = world.spawn(Name('kris'));
    player.destroy();
    expect(removed.mock.calls).toEqual([[player, 'kris']]);
    expect(world.lookup(Name('kris'))).toBeUndefined();
    const replacement = world.spawn(Name('kris'));
    expect(replacement.id()).not.toBe(player.id());
    expect(world.query(query).toArray()).toEqual([replacement]);
    expect(world.query(Removed(Name)).toArray()).toEqual([player]);
  });

  it('does not carry tracked events over to an entity that reuses the id', () => {
    // Disable destroyed-entity retention so the id is reused on the next spawn.
    world.destroy();
    world = createWorld({ retain: 0 });
    const Added = createAdded();
    const query = createQuery(Added(Position), Name('kris'));
    world.query(query);
    const player = world.spawn(Name('kris'));
    player.add(Position);
    player.destroy();
    const replacement = world.spawn();
    expect(replacement.id()).toBe(player.id());
    replacement.add(Name('kris'));
    expect(world.query(query)).toHaveLength(0);
  });

  it('does not add an entity to a tracking query again when another key is replaced', () => {
    const Added = createAdded();
    const query = createQuery(Added(Position), Name('kris'), WireId);
    const added = vi.fn();
    world.onEnter(query, added);
    const player = world.spawn(Name('kris'), WireId(1), Position);
    player.add(WireId(2));
    player.add(WireId(3));
    expect(added.mock.calls).toEqual([[player]]);
    expect(world.query(query).toArray()).toEqual([player]);
  });

  it('preserves query exclusion while lookup resolves ownership', () => {
    const entity = world.spawn(Name('hidden'), IsExcluded);
    expect(world.lookup(Name('hidden'))).toBe(entity);
    expect(world.queryFirst(Name('hidden'))).toBeUndefined();
    expect(world.query(createQuery(Name('hidden')))).toHaveLength(0);
  });

  it('keeps assignments coherent when a subscriber replaces or destroys the source', () => {
    const Changed = createChanged();
    const player = world.spawn(WireId(1));
    player.onRemove(WireId(1), () => player.add(WireId(3)));
    player.add(WireId(2));
    expect(world.lookup(WireId(2))).toBeUndefined();
    expect(world.lookup(WireId(3))).toBe(player);

    // A replacement made by an onAdd subscriber reports both assignments.
    world.query(Changed(WireId));
    const changed = vi.fn();
    player.onChange(WireId, changed);
    player.onAdd(WireId(4), () => player.add(WireId(5)));
    player.add(WireId(4));
    expect(world.lookup(WireId(4))).toBeUndefined();
    expect(world.lookup(WireId(5))).toBe(player);
    expect(changed.mock.calls).toEqual([
      [player, 4],
      [player, 5],
    ]);
    expect(world.query(Changed(WireId)).toArray()).toEqual([player]);

    player.onAdd(WireId(6), () => player.destroy());
    player.add(WireId(6));
    expect(world.lookup(WireId(6))).toBeUndefined();
  });

  it('rejects invalid key values', () => {
    for (const value of [undefined, null, {}, NaN, Infinity, -Infinity]) {
      expect(() => WireId(value as number)).toThrow(/strings or finite numbers/);
    }
  });

  it('releases ownership when removal callbacks assign to an entity being destroyed', () => {
    // Disable destroyed-entity retention so the id is reused on the next spawn.
    world.destroy();
    world = createWorld({ retain: 0 });
    const player = world.spawn(WireId(1));
    player.onRemove(WireId(1), () => player.add(WireId(2)));
    player.destroy();
    expect(world.lookup(WireId(1))).toBeUndefined();
    expect(world.lookup(WireId(2))).toBeUndefined();
    const replacement = world.spawn(WireId(2));
    expect(replacement.id()).toBe(player.id());
    expect(world.lookup(WireId(2))).toBe(replacement);
    expect(replacement.has(WireId(2))).toBe(true);
  });

  it('does not assign later terms when a query callback destroys a spawned entity', () => {
    world.onEnter([Name('transient')], (entity) => entity.destroy());
    const player = world.spawn(Name('transient'), WireId(1));
    expect(player.isAlive()).toBe(false);
    expect(world.lookup(Name('transient'))).toBeUndefined();
    expect(world.lookup(WireId(1))).toBeUndefined();
    expect(world.spawn(WireId(1)).has(WireId(1))).toBe(true);
  });

  describe('non-exclusive identifiers', () => {
    const DisplayName = identifier({ exclusive: false });

    it('looks up every owner while each entity still has one key', () => {
      expect(world.lookupAll(DisplayName('kris'))).toEqual([]);
      const first = world.spawn(DisplayName('kris'));
      expect(world.queryFirst(DisplayName('kris'))).toBe(first);
      expect(world.query(DisplayName('kris')).toArray()).toEqual([first]);
      const second = world.spawn(DisplayName('kris'));
      expect(world.query(DisplayName('kris')).toArray()).toEqual([first, second]);
      const matches = world.lookupAll(DisplayName('kris'));
      expectTypeOf(matches).toEqualTypeOf<Entity[]>();
      expectTypeOf(second.targetFor(DisplayName)).toEqualTypeOf<string | undefined>();
      expect(matches).toEqual([first, second]);
      expect(world.lookup(DisplayName('kris'))).toBe(first);
      expect(second.has(DisplayName('kris'))).toBe(true);
      expect(second.targetsFor(DisplayName)).toEqual(['kris']);

      const changed = vi.fn();
      second.onChange(DisplayName, changed);
      second.add(DisplayName('kris'));
      expect(changed).not.toHaveBeenCalled();
      second.add(DisplayName('sam'));
      expect(changed.mock.calls).toEqual([[second, 'sam']]);
      expect(second.targetFor(DisplayName)).toBe('sam');
      expect(world.lookupAll(DisplayName('kris'))).toEqual([first]);
      expect(world.lookupAll(DisplayName('sam'))).toEqual([second]);
      expect(matches).toEqual([first, second]);
      matches.length = 0;
      expect(world.lookupAll(DisplayName('kris'))).toEqual([first]);
    });

    it('intersects shared and unique keys in inline and cached queries', () => {
      const Team = identifier({ exclusive: false });
      const first = world.spawn(DisplayName('kris'), Team('red'), WireId(1), Position);
      const second = world.spawn(DisplayName('kris'), Team('blue'), WireId(2), Position);
      const third = world.spawn(DisplayName('kris'), Team('red'));
      world.spawn(DisplayName('sam'), Team('red'), Position);
      for (const terms of [
        [DisplayName('kris'), Team('red')],
        [Team('red'), DisplayName('kris')],
      ]) {
        expect(world.query(...terms).toArray()).toEqual([first, third]);
        expect(world.query(createQuery(...terms)).toArray()).toEqual([first, third]);
        expect(world.query(...terms, Position).toArray()).toEqual([first]);
      }
      for (const terms of [
        [DisplayName('kris'), WireId(2)],
        [WireId(2), DisplayName('kris')],
      ]) {
        expect(world.query(...terms).toArray()).toEqual([second]);
        expect(world.query(createQuery(...terms)).toArray()).toEqual([second]);
        expect(world.queryFirst(...terms)).toBe(second);
      }
      expect(world.query(DisplayName('kris'), DisplayName('sam'))).toHaveLength(0);
      expect(world.query(DisplayName('kris'), Not(Position)).toArray()).toEqual([third]);
      world.query(DisplayName('kris'), Position).each((position, entity) => {
        expectTypeOf(position).toEqualTypeOf<{ x: number }>();
        expectTypeOf(entity).toEqualTypeOf<Entity>();
        position.x = 7;
      });
      expect(first.get(Position)?.x).toBe(7);
      expect(second.get(Position)?.x).toBe(7);
    });

    it('updates cached queries and subscriptions for each shared owner', () => {
      const query = createQuery(DisplayName('kris'), Position);
      const added = vi.fn();
      const removed = vi.fn();
      world.onEnter(query, added);
      world.onExit(query, removed);
      const first = world.spawn(DisplayName('kris'), Position);
      const second = world.spawn(DisplayName('kris'));
      second.add(Position);
      expect(world.query(query).toArray()).toEqual([first, second]);
      first.add(DisplayName('sam'));
      expect(world.query(query).toArray()).toEqual([second]);
      second.remove(DisplayName('sam'));
      expect(second.has(DisplayName('kris'))).toBe(true);
      second.remove(DisplayName('kris'));
      expect(world.query(query)).toHaveLength(0);
      first.add(DisplayName('kris'));
      first.destroy();
      expect(world.query(query)).toHaveLength(0);
      expect(world.lookupAll(DisplayName('kris'))).toEqual([]);
      expect(added.mock.calls).toEqual([[first], [second], [first]]);
      expect(removed.mock.calls).toEqual([[first], [second], [first]]);
      world.reset();
      const next = world.spawn(DisplayName('kris'), Position);
      expect(world.query(query).toArray()).toEqual([next]);
    });

    it('releases only the departing owner on removal and destruction', () => {
      const first = world.spawn(DisplayName('kris'));
      const second = world.spawn(DisplayName('kris'));
      const third = world.spawn(DisplayName('kris'));
      second.remove(DisplayName('kris'));
      expect(world.lookupAll(DisplayName('kris'))).toEqual([first, third]);
      first.destroy();
      expect(world.lookup(DisplayName('kris'))).toBe(third);
      expect(world.lookupAll(DisplayName('kris'))).toEqual([third]);
      expect(third.has(DisplayName('kris'))).toBe(true);
      third.remove(DisplayName);
      expect(world.lookup(DisplayName('kris'))).toBeUndefined();
      const next = world.spawn(DisplayName('kris'));
      expect(world.lookupAll(DisplayName('kris'))).toEqual([next]);
    });
  });
});
