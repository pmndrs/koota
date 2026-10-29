import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  createAdded,
  createChanged,
  createQuery,
  createRemoved,
  createWorld,
  IsExcluded,
  Name,
  Not,
  relation,
  trait,
  type Entity,
  type NameConfig,
  type Trait,
  type TraitRecord,
} from '../src';

const Position = trait({ x: 0, y: 0 });
const IsEnemy = trait();

describe('Name', () => {
  const world = createWorld();

  beforeEach(() => {
    world.reset();
  });

  it('names an entity on spawn and looks it up', () => {
    const player = world.spawn(Name('player'), Position);

    expect(world.lookup('player')).toBe(player);
    expect(player.name()).toBe('player');
    expect(player.has(Name)).toBe(true);
    expect(player.has(Name('player'))).toBe(true);
    expect(player.has(Name('enemy'))).toBe(false);
    expect(player.get(Name)).toBe('player');
  });

  it('names an entity after spawn with add', () => {
    const entity = world.spawn();
    entity.add(Name('boss'));

    expect(world.lookup('boss')).toBe(entity);
  });

  it('uses the string atomic trait constructor and setter contract', () => {
    const construct = (Value: Trait<() => string>, value: string) => Value(value);
    const player = world.spawn(construct(Name, 'player'));

    expectTypeOf<TraitRecord<typeof Name>>().toEqualTypeOf<string>();
    expectTypeOf<ReturnType<typeof Name>>().toEqualTypeOf<NameConfig>();
    expectTypeOf(player.get(Name)).toEqualTypeOf<string | undefined>();
    expect(player.get(Name)).toBe('player');

    player.set(Name, (name) => {
      expectTypeOf(name).toEqualTypeOf<string>();
      return `${name}-renamed`;
    });

    expect(player.get(Name)).toBe('player-renamed');
    expect(world.lookup('player')).toBeUndefined();
    expect(world.lookup('player-renamed')).toBe(player);
  });

  it('sets string names on the world entity', () => {
    world.add(Name('scene'));
    const scene = world.lookup('scene');
    expect(scene).toBeDefined();

    world.set(Name, 'level');

    expect(world.get(Name)).toBe('level');
    expect(world.lookup('scene')).toBeUndefined();
    expect(world.lookup('level')).toBe(scene);
    expect(() => world.spawn(Name('level'))).toThrow(/NAME_TAKEN/);
  });

  it('returns undefined for unknown names and unnamed entities', () => {
    const entity = world.spawn();

    expect(world.lookup('missing')).toBeUndefined();
    expect(entity.name()).toBeUndefined();
  });

  it('throws when spawning with a taken name', () => {
    const first = world.spawn(Name('player'));

    expect(() => world.spawn(Name('player'))).toThrow(/NAME_TAKEN/);
    expect(world.lookup('player')).toBe(first);
    expect([...world.query(Name)]).toEqual([first]);
  });

  it('adds spawn traits in order and keeps the ones before a taken name', () => {
    const first = world.spawn(Name('player'));

    expect(() => world.spawn(Position, Name('player'), IsEnemy)).toThrow(/NAME_TAKEN/);
    expect(world.lookup('player')).toBe(first);
    expect(world.query(Position).length).toBe(1);
    expect(world.query(IsEnemy).length).toBe(0);
  });

  it('rejects adding a taken name to a different entity', () => {
    const player = world.spawn(Name('player'));
    const other = world.spawn();

    expect(() => other.add(Name('player'))).toThrow(/NAME_TAKEN/);
    expect(other.has(Name)).toBe(false);
    expect(world.lookup('player')).toBe(player);
  });

  it('throws on an empty name', () => {
    expect(() => world.spawn(Name(''))).toThrow(/non-empty/);
    expect(() => world.spawn(Name)).toThrow(/non-empty/);
    const player = world.spawn(Name('player'));
    expect(() => player.set(Name, '')).toThrow(/non-empty/);
    expect(player.get(Name)).toBe('player');
    expect(world.lookup('player')).toBe(player);
  });

  it('renames through set', () => {
    const entity = world.spawn(Name('player'));
    entity.set(Name, 'hero');

    expect(world.lookup('player')).toBeUndefined();
    expect(world.lookup('hero')).toBe(entity);
    expect(entity.name()).toBe('hero');
  });

  it('throws when setting Name on an entity without the trait', () => {
    const entity = world.spawn();

    expect(() => entity.set(Name, 'ghost')).toThrow(/Add the trait/);
    expect(world.lookup('ghost')).toBeUndefined();
  });

  it.each(['remove', 'destroy'] as const)(
    'does not notify a name change after a query callback performs %s',
    (action) => {
      const entity = world.spawn(Name('player'));
      const changed: Entity[] = [];
      world.onQueryAdd([Name('hero')], (entity) => {
        if (action === 'remove') entity.remove(Name);
        else entity.destroy();
      });
      world.onChange(Name, (entity) => changed.push(entity));
      entity.set(Name, 'hero');
      expect(changed).toEqual([]);
      expect(world.lookup('hero')).toBeUndefined();
    }
  );

  it('frees the old name so another entity can take it', () => {
    const first = world.spawn(Name('player'));
    first.set(Name, 'hero');
    const second = world.spawn(Name('player'));

    expect(world.lookup('player')).toBe(second);
    expect(() => second.set(Name, 'hero')).toThrow(/NAME_TAKEN/);
    expect(second.name()).toBe('player');
    expect(world.lookup('player')).toBe(second);
    expect(world.lookup('hero')).toBe(first);
  });

  it('frees the name when the trait is removed or the entity is destroyed', () => {
    const first = world.spawn(Name('player'));
    first.remove(Name);
    expect(world.lookup('player')).toBeUndefined();

    const second = world.spawn(Name('player'));
    second.destroy();
    expect(world.lookup('player')).toBeUndefined();

    const third = world.spawn(Name('player'));
    expect(world.lookup('player')).toBe(third);
  });

  it.each(['remove', 'destroy'] as const)(
    'retains name data for Removed queries after %s',
    (action) => {
      const Removed = createRemoved();
      const player = world.spawn(Name('player'));
      world.query(Removed(Name));
      const beforeRemoval: string[] = [];
      player.onRemove(Name, (entity) => {
        expect(entity.has(Name)).toBe(true);
        expect(world.lookup('player')).toBe(entity);
        beforeRemoval.push(entity.get(Name)!);
      });

      if (action === 'remove') player.remove(Name);
      else player.destroy();

      expect(beforeRemoval).toEqual(['player']);
      expect(world.lookup('player')).toBeUndefined();
      if (action === 'remove') {
        expect(player.get(Name)).toBeUndefined();
        expect(player.has(Name)).toBe(false);
      }
      const removed = world.query(Removed(Name));
      expect([...removed]).toEqual([player]);
      const names: string[] = [];
      removed.readEach(([name]) => names.push(name));
      expect(names).toEqual(['player']);
    }
  );

  it('reclaims the same name when the trait is reattached', () => {
    const player = world.spawn(Name('player'));
    player.remove(Name);
    player.add(Name('player'));

    expect(player.get(Name)).toBe('player');
    expect(world.lookup('player')).toBe(player);
    expect(world.queryFirst(Name('player'))).toBe(player);
  });

  it.each(['remove', 'destroy'] as const)(
    'preserves a reassigned name when initializing storage after %s',
    (action) => {
      const first = world.spawn(Name('player'));
      const owner = world.spawn();
      if (action === 'remove') first.remove(Name);
      else first.destroy();
      owner.add(Name('player'));

      let next = first;
      if (action === 'remove') next.add(Name('hero'));
      else next = world.spawn(Name('hero'));

      expect(next.id()).toBe(first.id());
      expect(owner.get(Name)).toBe('player');
      expect(world.lookup('player')).toBe(owner);
      expect(next.get(Name)).toBe('hero');
      expect(world.lookup('hero')).toBe(next);
      expect(() => next.set(Name, 'player')).toThrow(/NAME_TAKEN/);
      expect(world.lookup('hero')).toBe(next);
    }
  );

  it('excludes IsExcluded entities from name-only queries', () => {
    world.spawn(Name('player'), Position, IsExcluded);
    expect(world.query(Name('player')).length).toBe(0);
    expect(world.query(Name('player'), Position).length).toBe(0);
  });

  it('selects traits on name-only results', () => {
    const player = world.spawn(Name('player'), Position({ x: 1 }));
    world
      .query(Name('player'))
      .select(Position)
      .updateEach(([position]) => {
        position.x = 3;
      });
    expect(player.get(Position)?.x).toBe(3);
  });

  it('queries by name', () => {
    const player = world.spawn(Name('player'), Position);
    world.spawn(Name('enemy'), Position, IsEnemy);
    world.spawn(Position);

    expect([...world.query(Name('player'))]).toEqual([player]);
    expect(world.queryFirst(Name('player'))).toBe(player);
    expect(world.query(Name('missing')).length).toBe(0);
  });

  it('combines a name filter with other parameters', () => {
    const player = world.spawn(Name('player'), Position);
    const enemy = world.spawn(Name('enemy'), Position, IsEnemy);

    expect([...world.query(Name('player'), Position)]).toEqual([player]);
    expect(world.query(Name('player'), IsEnemy).length).toBe(0);
    expect(world.queryFirst(Name('enemy'), Position, IsEnemy)).toBe(enemy);
    expect(world.query(Name('player'), Name('enemy')).length).toBe(0);

    world.query(Name('player'), Position).updateEach(([position]) => {
      position.x = 5;
    });
    expect(player.get(Position)?.x).toBe(5);
    expect(enemy.get(Position)?.x).toBe(0);
  });

  for (const useModifier of [false, true]) {
    it('keeps names containing separators and Unicode distinct in cached queries', () => {
      const names = ['a,b', 'a|1:b', '["a","b"]', 'café/😀'];
      const entities = names.map((name) => world.spawn(Name(name), Position));
      const queries = names.map((name) => createQuery(Name(name), Position));
      expect(new Set(queries).size).toBe(names.length);
      for (let i = 0; i < names.length; i++) {
        expect(createQuery(Position, Name(names[i]))).toBe(queries[i]);
        expect([...world.query(queries[i])]).toEqual([entities[i]]);
      }

      const both = createQuery(Name('a'), Position, Name('b'));
      expect(createQuery(Name('b'), Name('a'), Position)).toBe(both);
      expect(createQuery(Name('a|1:b'), Position)).not.toBe(both);
      expect(createQuery(Name('ab'), Name('c'))).not.toBe(createQuery(Name('a'), Name('bc')));
    });

    it('keeps names distinct inside nested relation filters', () => {
      const ChildOf = relation();
      const player = world.spawn(Name('player'));
      const other = world.spawn(Name('player|1:x'));
      const first = world.spawn(Position, ChildOf(player));
      const second = world.spawn(Position, ChildOf(other));
      const playerQuery = createQuery(Position, ChildOf(Name('player')));
      const otherQuery = createQuery(Position, ChildOf(Name('player|1:x')));
      expect(createQuery(ChildOf(Name('player')), Position)).toBe(playerQuery);
      expect([...world.query(playerQuery)]).toEqual([first]);
      expect([...world.query(otherQuery)]).toEqual([second]);
    });

    it.each([false, true])(
      `keeps named pages separate from full query pages with modifier=${useModifier}, full first=%s`,
      (fullFirst) => {
        const player = world.spawn(Name('player'), Position({ x: 1 }));
        const enemy = world.spawn(Name('enemy'), Position({ x: 2 }));
        const named = () =>
          useModifier
            ? world.query(Name('player'), Position, Not(IsEnemy))
            : world.query(Name('player'), Position);

        const all = () => (useModifier ? world.query(Position, Not(IsEnemy)) : world.query(Position));
        if (fullFirst) all().getPages();
        const pages = named().getPages();
        expect(pages.flatMap((page) => page.entities)).toEqual([player]);
        for (const page of pages) {
          for (const offset of page.indices) page.stores[0].x[offset] = 10;
        }
        expect(player.get(Position)?.x).toBe(10);
        expect(enemy.get(Position)?.x).toBe(2);
        expect(
          all()
            .getPages()
            .flatMap((page) => page.entities)
        ).toEqual([player, enemy]);
        expect(
          world
            .query(Name('enemy'), Position)
            .getPages()
            .flatMap((page) => page.entities)
        ).toEqual([enemy]);
        expect(world.query(Name('missing'), Position).getPages()).toEqual([]);
      }
    );
  }

  it('checks current traits and excludes non-queryable entities', () => {
    const player = world.spawn(Name('player'), Position);
    expect(world.queryFirst(Name('player'), Position)).toBe(player);
    player.remove(Position);
    expect(world.queryFirst(Name('player'), Position)).toBeUndefined();
    player.add(Position);
    expect(world.queryFirst(Name('player'), Position)).toBe(player);
    expect(world.queryFirst(Name('player'), IsEnemy)).toBeUndefined();
    player.add(IsEnemy);
    expect(world.queryFirst(Name('player'), IsEnemy)).toBe(player);
    player.add(IsExcluded);
    expect(world.queryFirst(Name('player'), Position)).toBeUndefined();
  });

  it('emits and tracks changes from named updates', () => {
    const Changed = createChanged();
    const player = world.spawn(Name('player'), Position);
    const enemy = world.spawn(Name('enemy'), Position);
    world.query(Changed(Position));
    const changed: number[] = [];
    const unsubscribe = world.onChange(Position, (entity) => changed.push(entity));

    world.query(Name('player'), Position).updateEach(([position]) => {
      position.x = 5;
    });

    expect(changed).toEqual([player]);
    expect(enemy.get(Position)?.x).toBe(0);
    expect([...world.query(Name('player'), Changed(Position))]).toEqual([player]);
    expect(world.query(Name('player'), Changed(Position))).toHaveLength(0);
    unsubscribe();
  });

  it('does not inherit tracked changes when a named entity is replaced', () => {
    const Changed = createChanged();
    const player = world.spawn(Name('player'), Position);
    world.query(Name('player'), Changed(Position));
    player.set(Position, { x: 1 });
    player.destroy();

    const replacement = world.spawn(Name('player'), Position);

    expect(world.lookup('player')).toBe(replacement);
    expect([...world.query(Name('player'), Changed(Position))]).toEqual([]);
  });

  it.each([
    { event: 'added', createTracking: createAdded },
    { event: 'changed', createTracking: createChanged },
    { event: 'removed', createTracking: createRemoved },
  ])('filters $event events by name after many traits are registered', ({ createTracking }) => {
    const player = world.spawn(Name('player'));
    world.spawn(...Array.from({ length: 31 }, () => trait()));
    const Track = createTracking();

    player.add(Position);
    player.set(Position, { x: 1 });
    if (createTracking === createRemoved) player.remove(Position);

    expect([...world.query(Name('player'), Track(Position))]).toEqual([player]);
    expect([...world.query(Name('player'), Track(Position))]).toEqual([]);

    player.remove(Position);
    player.add(Position);
    player.set(Position, { x: 2 });
    if (createTracking === createRemoved) player.remove(Position);

    expect([...world.query(Name('player'), Track(Position))]).toEqual([player]);
    expect([...world.query(Name('player'), Track(Position))]).toEqual([]);
  });

  it('queries all named entities with the bare trait', () => {
    world.spawn(Name('a'));
    world.spawn(Name('b'));
    world.spawn();

    const names = world.query(Name).map((entity) => entity.name());
    expect(names.sort()).toEqual(['a', 'b']);
  });

  it('keeps names local to each world', () => {
    const other = createWorld();
    const first = world.spawn(Name('player'));
    const second = other.spawn(Name('player'));

    expect(world.lookup('player')).toBe(first);
    expect(other.lookup('player')).toBe(second);
    world.reset();
    expect(other.lookup('player')).toBe(second);
    other.destroy();
    expect(other.lookup('player')).toBeUndefined();
  });

  it('resolves a replacement entity under the same name', () => {
    const filter = Name('player');
    const first = world.spawn(filter);
    first.destroy();
    const replacement = world.spawn(Name('player'));

    expect(world.lookup('player')).toBe(replacement);
    expect(world.queryFirst(filter)).toBe(replacement);
    expect(replacement.has(filter)).toBe(true);
  });

  it.each(['auto', 'always', 'never'] as const)(
    'renames through updateEach and keeps subscriptions current with %s change detection',
    (changeDetection) => {
      const player = world.spawn(Name('player'), Position);
      const query = createQuery(Name('player'), Position);
      const Changed = createChanged();
      world.query(Changed(Name));
      const events: string[] = [];
      world.onQueryRemove(query, () => events.push('remove'));
      world.onQueryAdd([Name('hero')], () => events.push('add'));
      world.onChange(Name, (entity) => {
        expect(world.lookup(entity.name()!)).toBe(entity);
        events.push('change');
      });

      world.query(Name, Position).updateEach(
        ([name, position]) => {
          expect(name).toBe('player');
          position.x = 1;
        },
        { changeDetection }
      );
      expect(events).toEqual(changeDetection === 'always' ? ['change'] : []);
      events.length = 0;
      world.query(Changed(Name));

      world.query(Name).updateEach(
        (state) => {
          state[0] = 'hero';
        },
        { changeDetection }
      );

      expect(player.name()).toBe('hero');
      expect(player.get(Name)).toBe('hero');
      expect(player.get(Position)?.x).toBe(1);
      expect(world.lookup('player')).toBeUndefined();
      expect(world.lookup('hero')).toBe(player);
      expect(world.query(query)).toHaveLength(0);
      expect(events).toEqual(
        changeDetection === 'never' ? ['remove', 'add'] : ['remove', 'add', 'change']
      );
      expect([...world.query(Changed(Name))]).toEqual(changeDetection === 'never' ? [] : [player]);
      expect(world.spawn(Name('player')).name()).toBe('player');
    }
  );

  it('renames through updateEach without change subscribers', () => {
    const entity = world.spawn(Name('player'));
    world.query(Name).updateEach((state) => {
      state[0] = 'hero';
    });
    expect(world.lookup('player')).toBeUndefined();
    expect(world.lookup('hero')).toBe(entity);
  });

  it.each(['auto', 'always', 'never'] as const)(
    'preserves both names when updateEach attempts a duplicate with %s change detection',
    (changeDetection) => {
      const player = world.spawn(Name('player'));
      const hero = world.spawn(Name('hero'));
      const events: Entity[] = [];
      world.onChange(Name, (entity) => events.push(entity));
      world.onQueryRemove([Name('player')], (entity) => events.push(entity));

      expect(() =>
        world.query(Name('player'), Name).updateEach(
          (state) => {
            state[0] = 'hero';
          },
          { changeDetection }
        )
      ).toThrow(/NAME_TAKEN/);

      expect(player.name()).toBe('player');
      expect(hero.name()).toBe('hero');
      expect(world.lookup('player')).toBe(player);
      expect(world.lookup('hero')).toBe(hero);
      expect(events).toEqual([]);
    }
  );

  it('keeps accessor state local to the world across reset and entity reuse', () => {
    const other = createWorld();
    const first = world.spawn(Name('player'));
    const second = other.spawn(Name('player'));
    world.query(Name).updateEach((state) => {
      state[0] = 'hero';
    });
    expect(other.lookup('player')).toBe(second);
    expect(other.lookup('hero')).toBeUndefined();
    first.destroy();
    expect(world.lookup('hero')).toBeUndefined();
    world.reset();
    const replacement = world.spawn(Name('player'));
    world.query(Name).updateEach((state) => {
      state[0] = 'hero';
    });
    expect(world.lookup('hero')).toBe(replacement);
    expect(other.lookup('player')).toBe(second);
    other.destroy();
  });

  it('does not restore a name removed inside updateEach', () => {
    const player = world.spawn(Name('player'));
    world.query(Name).updateEach((state, entity) => {
      entity.remove(Name);
      state[0] = 'hero';
    });
    expect(player.has(Name)).toBe(false);
    expect(world.lookup('player')).toBeUndefined();
    expect(world.lookup('hero')).toBeUndefined();
  });

  it('exposes name pages for reading alongside other traits', () => {
    const player = world.spawn(Name('player'), Position({ x: 10 }));
    const [namePage] = world.query(Name).getPages();
    expectTypeOf(namePage.stores[0]).toEqualTypeOf<string[]>();
    expect(namePage.stores[0][namePage.indices[0]]).toBe('player');
    expect(world.query(Name, Position).getPages()).toHaveLength(1);

    const [page] = world.query(Name('player'), Position).getPages();
    page.stores[0].x[page.indices[0]] = 20;
    expect(player.get(Position)?.x).toBe(20);
    expect(world.query(Name, Position).select(Position).getPages()).toHaveLength(1);
    expect(world.lookup('player')).toBe(player);
  });

  it('requires string names', () => {
    // @ts-expect-error names must be strings
    expect(() => Name(42)).toThrow(/non-empty string/);
    // @ts-expect-error names are atomic strings
    expect(() => Name({ value: 'player' })).toThrow(/non-empty string/);
  });

  it('resolves cached queries independently in each world and after reset', () => {
    const query = createQuery(Name('player'), Position);
    const other = createWorld();
    expect(world.query(query)).toHaveLength(0);
    const player = world.spawn(Name('player'), Position);
    const otherPlayer = other.spawn(Name('player'), Position);
    expect(world.queryFirst(query)).toBe(player);
    expect(other.queryFirst(query)).toBe(otherPlayer);
    player.set(Name, 'hero');
    expect(world.query(query)).toHaveLength(0);
    const replacement = world.spawn(Name('player'), Position);
    expect(world.queryFirst(query)).toBe(replacement);
    world.reset();
    expect(world.query(query)).toHaveLength(0);
    expect(other.queryFirst(query)).toBe(otherPlayer);
    const next = world.spawn(Name('player'), Position);
    expect(world.queryFirst(query)).toBe(next);
    other.destroy();
  });

  it('distinguishes names in cached query keys and preserves parameter order', () => {
    const player = createQuery(Name('player'), Position);
    expect(createQuery(Position, Name('player'))).toBe(player);
    expect(createQuery(Name('enemy'), Position)).not.toBe(player);
    expect(createQuery(Name('a,b'))).not.toBe(createQuery(Name('a'), Name('b')));
    world.spawn(Name('a,b'), Position);
    expect(world.query(createQuery(Name('a,b')))).toHaveLength(1);
    expect(world.query(createQuery(Name('a'), Name('b')))).toHaveLength(0);
  });

  it.each([false, true])(
    'notifies named query subscriptions through the lifecycle, cached=%s',
    (cached) => {
      const params = [Name('player'), Position, Not(IsEnemy)] as const;
      const events: string[] = [];
      const onAdd = (entity: Entity) => {
        expect(world.lookup('player')).toBe(entity);
        events.push('add');
      };
      const onRemove = () => events.push('remove');
      const stopAdd = cached
        ? world.onQueryAdd(createQuery(...params), onAdd)
        : world.onQueryAdd([...params], onAdd);
      const stopRemove = cached
        ? world.onQueryRemove(createQuery(...params), onRemove)
        : world.onQueryRemove([...params], onRemove);
      const player = world.spawn(Name('player'), Position);
      world.spawn(Name('enemy'), Position);
      player.set(Name, 'player');
      player.remove(Position);
      player.add(Position);
      player.add(IsEnemy);
      player.remove(IsEnemy);
      player.set(Name, 'hero', false);
      player.set(Name, 'player');
      player.remove(Name);
      player.add(Name('player'));
      player.destroy();
      world.spawn(Name('player'), Position);
      expect(events).toEqual([
        'add',
        'remove',
        'add',
        'remove',
        'add',
        'remove',
        'add',
        'remove',
        'add',
        'remove',
        'add',
      ]);
      stopAdd();
      stopRemove();
      world.lookup('player')!.destroy();
      expect(events).toHaveLength(11);
    }
  );

  it('keeps name-only subscriptions current on rename', () => {
    const query = createQuery(Name('player'));
    const events: string[] = [];
    world.onQueryAdd(query, () => events.push('add'));
    world.onQueryRemove(query, () => events.push('remove'));
    const entity = world.spawn(Name('hero'));
    entity.set(Name, 'player');
    entity.add(Position);
    entity.set(Name, 'hero');
    expect(events).toEqual(['add', 'remove']);
    expect(world.query(query)).toHaveLength(0);
  });

  it('keeps tracking queries for different names independent', () => {
    const Changed = createChanged();
    const playerQuery = createQuery(Name('player'), Changed(Position));
    const enemyQuery = createQuery(Name('enemy'), Changed(Position));
    const player = world.spawn(Name('player'), Position);
    const enemy = world.spawn(Name('enemy'), Position);
    world.query(playerQuery);
    world.query(enemyQuery);
    player.set(Position, { x: 1 });
    enemy.set(Position, { x: 2 });
    expect([...world.query(playerQuery)]).toEqual([player]);
    expect([...world.query(enemyQuery)]).toEqual([enemy]);
    expect(world.query(playerQuery)).toHaveLength(0);
  });

  it('supports named targets in relation queries and subscriptions', () => {
    const Targets = relation();
    const player = world.spawn(Name('player'));
    const source = world.spawn(Targets(player));
    const query = createQuery(Targets(Name('player')));
    expect([...world.query(query)]).toEqual([source]);
    const events: string[] = [];
    world.onQueryAdd(query, () => events.push('add'));
    world.onQueryRemove(query, () => events.push('remove'));
    player.set(Name, 'hero');
    expect(world.query(query)).toHaveLength(0);
    player.set(Name, 'player');
    expect([...world.query(query)]).toEqual([source]);
    expect(events).toEqual(['remove', 'add']);
  });

  it('clears names on reset', () => {
    world.spawn(Name('player'));
    world.reset();

    expect(world.lookup('player')).toBeUndefined();
    expect(() => world.spawn(Name('player'))).not.toThrow();
  });
});
