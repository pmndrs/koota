import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createQuery,
  createRemoved,
  createWorld,
  Not,
  Or,
  ordered,
  relation,
  trait,
  type Entity,
  type Relation,
} from '../src';

describe('relation targets in each', () => {
  it('passes exclusive wildcard and query targets in parameter order', () => {
    const world = createWorld();
    const Position = trait({ x: 0 });
    const IsMap = trait();
    const IsSource = trait();
    const LayerOf = relation({ exclusive: true });
    const Draws = relation<{ opacity: number }>({ exclusive: true, store: { opacity: 1 } });
    const map = world.spawn(IsMap);
    const source = world.spawn(IsSource);
    const layer = world.spawn(Position, LayerOf(map), Draws(source));
    const changed = vi.fn();
    world.onChange(Position, changed);

    const query = world.query(LayerOf('*'), Position, Draws(createQuery(IsSource)));
    query.each((parent, position, target, entity, index) => {
      expectTypeOf(parent).toEqualTypeOf<Entity>();
      expectTypeOf(target).toEqualTypeOf<Entity>();
      expectTypeOf(entity).toEqualTypeOf<Entity>();
      expectTypeOf(index).toEqualTypeOf<number>();
      expect([parent, target, entity, index]).toEqual([map, source, layer, 0]);
      position.x++;
    });
    expect(layer.get(Position)).toEqual({ x: 1 });
    expect(changed).toHaveBeenCalledExactlyOnceWith(layer);

    world.query(LayerOf(IsMap), Draws(IsSource)).each((parent, target, entity) => {
      expect([parent, target, entity]).toEqual([map, source, layer]);
    });
    expect(layer.get(Draws(source))).toEqual({ opacity: 1 });
    world.destroy();
  });

  it('reuses target snapshots without exposing them to structural commands or nested walks', () => {
    const world = createWorld();
    const Position = trait({ x: 0 });
    const Contains = relation<{ amount: number }>({ store: { amount: 0 } });
    const Likes = relation();
    const gold = world.spawn();
    const silver = world.spawn();
    const copper = world.spawn();
    const inventory = world.spawn(
      Position,
      Contains(gold, { amount: 2 }),
      Contains(silver),
      Likes(gold)
    );
    const pouch = world.spawn(Position, Contains(copper), Likes(gold));
    const query = world.query(Position, Contains('*'), Likes('*'));
    const saved = inventory.targetsFor(Contains);
    const changed = vi.fn();
    world.onChange(Position, changed);
    const visited: Entity[] = [];
    let scratch: readonly Entity[] | undefined;

    query.each((position, targets, likedTargets, entity, index) => {
      expectTypeOf(targets).toEqualTypeOf<readonly Entity[]>();
      expect(likedTargets).toEqual([gold]);
      expect(index).toBe(visited.length);
      visited.push(entity);
      position.x++;
      if (entity === inventory) {
        scratch = targets;
        for (const target of targets) {
          if (target === silver) target.destroy();
          else entity.remove(Contains(target));
        }
        expect(entity.targetsFor(Contains)).toEqual([]);
        entity.add(Contains(copper));
        const nested: Entity[] = [];
        query.each((_position, innerTargets, innerLiked, innerEntity) => {
          expect(innerTargets).not.toBe(targets);
          expect(innerTargets).toEqual([copper]);
          expect(innerLiked).not.toBe(likedTargets);
          expect(innerLiked).toEqual([gold]);
          nested.push(innerEntity);
        });
        expect(nested).toEqual([inventory, pouch]);
        expect(targets).toEqual([gold, silver]);
        expect(likedTargets).toEqual([gold]);
      } else {
        expect(targets).toBe(scratch);
        expect(targets).toEqual([copper]);
      }
    });
    expect(visited).toEqual([inventory, pouch]);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(saved).toEqual([gold, silver]);
    expect(inventory.get(Contains(copper))).toEqual({ amount: 0 });
    query.each((_position, targets) => {
      expect(targets).toBe(scratch);
      expect(targets).toEqual([copper]);
    });
    world.destroy();
  });

  it('keeps projections ordered across cached queries, selections and nested walks', () => {
    const world = createWorld();
    const Position = trait({ x: 1 });
    const Name = trait(() => ({ value: 'layer' }));
    const Parent = relation({ exclusive: true });
    const Contains = relation();
    const target = world.spawn();
    const entity = world.spawn(Position, Name, Parent(target), Contains(target));
    const query = world.query(Position, Parent('*'), Name, Contains('*'));

    query.each((position, parent, name, contents, current) => {
      expect([position.x, parent, name.value, contents, current]).toEqual([
        1,
        target,
        'layer',
        [target],
        entity,
      ]);
      query.select(Name, Contains('*'), Parent('*')).each((name, contents, parent, current) => {
        expect([name.value, contents, parent, current]).toEqual(['layer', [target], target, entity]);
      });
      query.select(Position).each((position, current, index) => {
        expect([position.x, current, index]).toEqual([1, entity, 0]);
      });
    });
    world
      .query(Contains('*'), Name, Parent('*'), Position)
      .each((contents, name, parent, position, current) => {
        expect([contents, name.value, parent, position.x, current]).toEqual([
          [target],
          'layer',
          target,
          1,
          entity,
        ]);
      });
    query.each((_position, parent, _name, contents) => {
      expect([parent, contents]).toEqual([target, [target]]);
    });
    world.destroy();
  });

  it('preserves projection order in cached query references', () => {
    const world = createWorld();
    const Position = trait({ x: 1 });
    const Name = trait({ value: 'child' });
    const Parent = relation({ exclusive: true });
    const parent = world.spawn();
    const child = world.spawn(Position, Name, Parent(parent));
    const forward = createQuery(Position, Parent('*'));
    const reverse = createQuery(Parent('*'), Position);
    expect(createQuery(Position, Parent('*'))).toBe(forward);
    expect(createQuery(Position, Parent(parent))).toBe(createQuery(Position, Parent(parent)));
    world.query(forward).each((position, target, entity) => {
      expect([position.x, target, entity]).toEqual([1, parent, child]);
    });
    world.query(reverse).each((target, position, entity) => {
      expect([target, position.x, entity]).toEqual([parent, 1, child]);
    });
    const either = createQuery(Or(Position, Name), Parent('*'));
    const reversedEither = createQuery(Or(Name, Position), Parent('*'));
    world.query(either).each((position, name, target) => {
      expect([position.x, name.value, target]).toEqual([1, 'child', parent]);
    });
    world.query(reversedEither).each((name, position, target) => {
      expect([name.value, position.x, target]).toEqual(['child', 1, parent]);
    });
    world.destroy();
  });

  it('leaves concrete targets, modifiers and non-exclusive target queries as filters', () => {
    const world = createWorld();
    const Active = trait();
    const Missing = trait();
    const Parent = relation({ exclusive: true });
    const Contains = relation();
    const target = world.spawn(Active);
    const entity = world.spawn(Parent(target), Contains(target));
    const query = world.query(
      Parent(target),
      Contains(Active),
      Or(Parent('*'), Missing),
      Not(Parent(Missing))
    );
    query.each((current, index) => {
      expectTypeOf(current).toEqualTypeOf<Entity>();
      expectTypeOf(index).toEqualTypeOf<number>();
      expect([current, index]).toEqual([entity, 0]);
    });
    expect(query.length).toBe(1);
    world.destroy();
  });

  it('preserves legacy iterator state and page stores', () => {
    const world = createWorld();
    const Position = trait({ x: 1 });
    const Parent = relation({ exclusive: true });
    const target = world.spawn();
    const entity = world.spawn(Position, Parent(target));
    const query = world.query(Parent('*'), Position);
    query.readEach(([position], current) => {
      expectTypeOf(position).toEqualTypeOf<{ x: number }>();
      expect(current).toBe(entity);
      expect(position.x).toBe(1);
    });
    query.updateEach(([position], current) => {
      expect(current).toBe(entity);
      position.x++;
    });
    query.each((parent, position) => {
      expect([parent, position.x]).toEqual([target, 2]);
    });
    expect(query.getPages()[0].stores).toHaveLength(1);
    world.destroy();
  });

  it('projects targets in sorted and ordered relation selections', () => {
    const world = createWorld();
    const Position = trait({ x: 1 });
    const Parent = relation({ exclusive: true });
    const Children = ordered(Parent);
    const parent = world.spawn(Children);
    const child = world.spawn(Position, Parent(parent));
    for (const view of [
      world.query(Position, Parent('*')).sort((a, b) => a - b),
      parent.get(Children)!.select(Position, Parent('*')),
    ]) {
      const seen: [number, Entity, Entity][] = [];
      view.each((position, target, entity) => {
        seen.push([position.x, target, entity]);
      });
      expect(seen).toEqual([[1, parent, child]]);
    }
    world.destroy();
  });

  it('isolates cached and concrete lookup projections across worlds and later additions', () => {
    const Parent = relation({ exclusive: true });
    const Contains = relation();
    const query = createQuery(Parent('*'));
    const worlds = [createWorld(), createWorld()];
    const entries = worlds.map((world) => {
      const view = world.query(query);
      const parent = world.spawn();
      const item = world.spawn();
      const child = world.spawn(Parent(parent), Contains(item));
      return { world, view, parent, item, child };
    });
    for (let i = 0; i < 2; i++) {
      for (const { world, view, parent, item, child } of entries) {
        const seen: Entity[][] = [];
        view.each((target, entity) => {
          seen.push([target, entity]);
        });
        world
          .query(Parent(parent))
          .select(Contains('*'))
          .each((targets, entity) => {
            seen.push([...targets, entity]);
          });
        expect(seen).toEqual([
          [parent, child],
          [item, child],
        ]);
      }
    }
    for (const world of worlds) world.destroy();
  });

  it('keeps widened policy and target types honest about callback arguments', () => {
    const world = createWorld();
    const Parent = relation({ exclusive: true });
    const fromDefinition = (definition?: { exclusive: boolean }) => relation(definition);
    const Dynamic: Relation = fromDefinition({ exclusive: true });
    const Tag = trait();
    const parent = world.spawn(Tag);
    const child = world.spawn(Parent(parent), Dynamic(parent));
    world.query(Dynamic('*')).each((target, entity) => {
      expectTypeOf(target).toEqualTypeOf<Entity | readonly Entity[]>();
      expect([target, entity]).toEqual([parent, child]);
    });
    for (const target of [parent, '*' as const]) {
      world.query(Parent(target)).each((...args) => {
        expectTypeOf(args).toEqualTypeOf<[Entity, number] | [Entity, Entity, number]>();
      });
    }
    world.query(Dynamic(Tag)).each((...args) => {
      expectTypeOf(args).toEqualTypeOf<[Entity, number] | [Entity, Entity, number]>();
    });
    world.destroy();
  });

  it('skips rows that leave the query before they are visited', () => {
    const world = createWorld();
    const Position = trait({ x: 0 });
    const ChildOf = relation({ exclusive: true });
    const Contains = relation();
    const parentA = world.spawn();
    const parentB = world.spawn();
    const first = world.spawn(Position, ChildOf(parentA), Contains(parentA));
    const unparented = world.spawn(Position, ChildOf(parentB), Contains(parentB));
    const orphaned = world.spawn(Position, ChildOf(parentB), Contains(parentB));
    const stripped = world.spawn(Position, ChildOf(parentA), Contains(parentA));
    const readded = world.spawn(Position, ChildOf(parentA), Contains(parentA));
    const last = world.spawn(Position, ChildOf(parentA), Contains(parentA));
    const query = world.query(Position, ChildOf('*'), Contains('*'));
    const visited: [Entity, Entity, readonly Entity[]][] = [];

    query.each((_position, parent, contents, entity) => {
      visited.push([entity, parent, contents.slice()]);
      if (entity !== first) return;
      // Later rows lose their pair, their parent or their trait while this walk is in progress.
      unparented.remove(ChildOf(parentB));
      parentB.destroy();
      stripped.remove(Position);
      readded.remove(ChildOf(parentA));
      readded.add(ChildOf(parentA));
    });

    expect(visited).toEqual([
      [first, parentA, [parentA]],
      [readded, parentA, [parentA]],
      [last, parentA, [parentA]],
    ]);
    // Re-adding the pair moves the entity to the end of the query.
    expect(world.query(Position, ChildOf('*'), Contains('*')).toArray()).toEqual([
      first,
      last,
      readded,
    ]);
    expect(orphaned.has(ChildOf(parentB))).toBe(false);

    // A sorted view walks its own copy, so removals apply at once and still skip the row.
    const sortedVisited: Entity[] = [];
    world
      .query(Position, ChildOf('*'))
      .sort((a, b) => a.x - b.x, [Position])
      .each((_position, parent, entity) => {
        expect(parent).toBe(parentA);
        sortedVisited.push(entity);
        for (const other of [first, last, readded]) {
          if (other !== entity) other.remove(ChildOf(parentA));
        }
      });
    expect(sortedVisited).toHaveLength(1);
    world.destroy();
  });

  it('reads the targets a destroyed entity died with in Removed walks', () => {
    const world = createWorld();
    const Removed = createRemoved();
    const Health = trait({ hp: 1 });
    const ChildOf = relation({ exclusive: true });
    const Contains = relation();
    const parent = world.spawn();
    const item = world.spawn();
    const child = world.spawn(Health, ChildOf(parent), Contains(item));
    const query = createQuery(ChildOf('*'), Contains('*'), Removed(Health));
    expect(world.query(query).length).toBe(0);

    child.destroy();
    // The Removed term still passes the record the entity died with, ahead of the entity.
    const seen: [Entity, readonly Entity[], number, Entity][] = [];
    world
      .query(query)
      .each((target, contents, health, entity) =>
        seen.push([target, contents.slice(), health.hp, entity])
      );
    expect(seen).toEqual([[parent, [item], 1, child]]);
    world.destroy();
  });
});
