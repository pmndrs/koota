import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $internal,
  createAdded,
  createChanged,
  createRemoved,
  createWorld,
  getStore,
  Not,
  Or,
  relation,
  trait,
  type QueryView,
} from '../src';

const Position = trait({ x: 0, y: 0 });
const IsActive = trait();
const Foo = trait();
const Bar = trait();

describe('Query modifiers', () => {
  const world = createWorld();

  beforeEach(() => {
    world.reset();
  });

  it('should correctly populate Not queries when traits are added and removed', () => {
    const entityA = world.spawn();
    const entityB = world.spawn();
    const entityC = world.spawn();

    let entities: any = world.query(Foo);
    expect(entities.length).toBe(0);

    entities = world.query(Not(Foo));
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);
    expect(entities.at(2)).toBe(entityC);

    // Add
    entityA.add(Foo);
    entityB.add(Bar);
    entityC.add(Foo, Bar);

    entities = world.query(Foo);
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityC);

    entities = world.query(Foo, Bar);
    expect(entities.first!).toBe(entityC);

    entities = world.query(Not(Foo));
    expect(entities.first!).toBe(entityB);

    // entities = world.query(Not(Foo), Or(Foo));
    // expect(entities.length).toBe(3);

    // Remove
    entityA.remove(Foo);

    entities = world.query(Foo);
    expect(entities.first!).toBe(entityC);

    entities = world.query(Not(Foo));
    expect(entities.first!).toBe(entityB);
    expect(entities.at(1)).toBe(entityA);

    entities = world.query(Not(Foo), Not(Bar));
    expect(entities.first!).toBe(entityA);

    // Remove more so entity A and C have no traits
    entityC.remove(Foo);
    entityC.remove(Bar);

    entities = world.query(Not(Foo), Not(Bar));
    expect(entities.length).toBe(2);

    entities = world.query(Not(Foo));
    expect(entities.length).toBe(3);
  });

  it('should correctly populate Not queries when relations are added and removed', () => {
    const ctx = world[$internal];
    const ChildOf = relation();
    const parent = world.spawn();
    const child = world.spawn();

    let entities: any = world.query(ChildOf('*'));
    expect(entities.length).toBe(0);

    entities = world.query(Not(ChildOf));
    expect(entities.length).toBe(2);

    child.add(ChildOf(parent));

    entities = world.query(ChildOf('*'));
    expect(entities.first!).toEqual(child);
    expect(entities.length).toBe(1);

    entities = world.query(Not(ChildOf));
    expect(entities.first!).toEqual(parent);
    expect(entities.length).toBe(1);

    // entities = world.query(Not(ChildOf), Or(ChildOf));
    // expect(entities.length).toBe(2);

    child.remove(ChildOf('*'));

    entities = world.query(ChildOf('*'));
    expect(entities.length).toBe(0);

    entities = world.query(Not(ChildOf));
    expect(entities.length).toBe(2);
  });

  it('Not queries drop destroyed entities', () => {
    const plain = world.spawn();
    const withBar = world.spawn(Bar);
    const withFoo = world.spawn(Foo);
    expect(world.query(Not(Foo)).toArray()).toEqual([plain, withBar]);

    const added = vi.fn();
    world.onEnter([Not(Foo)], added);

    plain.destroy();
    withBar.destroy();
    withFoo.destroy();

    expect(world.query(Not(Foo))).toHaveLength(0);
    // Losing Foo while dying does not turn the entity into a match.
    expect(added).not.toHaveBeenCalled();
  });

  it('modifiers can be added as one call or separately', () => {
    const ctx = world[$internal];
    const entity = world.spawn();
    entity.add(Position, IsActive);

    let entities: any = world.query(Not(Foo), Not(Bar));
    expect(entities.length).toBe(1);

    entities = world.query(Not(Foo, Bar));
    expect(entities.length).toBe(1);

    // These queries should be hashed the same.
    expect(ctx.queriesHashMap.size).toBe(1);
  });

  it('should correctly populate Added queries when traits are added', () => {
    const Added = createAdded();

    const entityA = world.spawn();
    const entityB = world.spawn();
    const entityC = world.spawn();

    let entities: QueryView<any>;

    entities = world.query(Added(Foo));
    expect(entities.length).toBe(0);

    entityA.add(Foo);
    entities = world.query(Added(Foo));
    expect(entities.first!).toBe(entityA);

    // The query gets drained and should be empty when run again.
    entities = world.query(Added(Foo));
    expect(entities.length).toBe(0);

    entityB.add(Foo);
    entities = world.query(Added(Foo));
    expect(entities.first!).toBe(entityB);

    // And a static query should give both entities.
    entities = world.query(Foo);
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);

    // Should not be added to the query if the trait is removed before it is read.
    entityC.add(Foo);
    entityC.remove(Foo);
    entities = world.query(Added(Foo));
    expect(entities.length).toBe(0);

    // But if it is removed and added again in the same frame it should be recorded.
    entityA.remove(Foo);
    entityA.add(Foo);
    entities = world.query(Added(Foo));
    expect(entities.first!).toBe(entityA);

    // Should only populate the query if tracked trait is added,
    // even if it matches the query otherwise.
    entityA.remove(Foo, Bar); // Quick reset
    entityA.add(Foo);
    world.query(Added(Foo)); // Drain query

    entityA.add(Bar);
    entities = world.query(Added(Foo));
    expect(entities.length).toBe(0); // Fails for Added
    entities = world.query(Foo, Bar);
    expect(entities.first!).toBe(entityA); // But matches static query
  });

  it('should properly populate Added queries with mulitple tracked traits', () => {
    const Added = createAdded();

    const entityA = world.spawn();
    const entityB = world.spawn();

    let entities = world.query(Added(Foo, Bar));
    expect(entities.length).toBe(0);

    entityA.add(Foo);
    entities = world.query(Added(Foo, Bar));
    expect(entities.length).toBe(0);

    entityA.add(Bar);
    entities = world.query(Added(Foo, Bar));
    expect(entities.first!).toBe(entityA);

    entityB.add(Foo);
    entities = world.query(Added(Foo, Bar));
    expect(entities.length).toBe(0);

    entityB.add(Bar);
    entities = world.query(Added(Foo, Bar));
    expect(entities.first!).toBe(entityB);
  });

  it('should track multiple Added modifiers independently', () => {
    const Added = createAdded();
    const Added2 = createAdded();

    const entityA = world.spawn();
    const entityB = world.spawn();

    let entities = world.query(Added(Foo));
    expect(entities.length).toBe(0);

    let entities2 = world.query(Added2(Foo));
    expect(entities2.length).toBe(0);

    entityA.add(Foo);
    entities = world.query(Added(Foo));
    expect(entities.length).toBe(1);

    entityB.remove(Foo);
    entityB.add(Foo);
    entities = world.query(Added(Foo));
    entities2 = world.query(Added2(Foo));

    expect(entities.length).toBe(1);
    expect(entities2.length).toBe(2);
  });

  it('should seed Added queries from the world history when created after the trait is added', () => {
    const Added = createAdded();

    const entityA = world.spawn(Foo);
    const entityB = world.spawn(Foo, Bar);

    let entities: any = world.query(Added(Foo));
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);

    entities = world.query(Added(Foo, Bar));
    expect(entities.first!).toBe(entityB);

    // A modifier created later still sees the entities that currently hold the trait.
    const LaterAdded = createAdded();

    let entities2 = world.query(LaterAdded(Foo));
    expect(entities2.length).toBe(2);

    entityA.remove(Foo); // Reset
    entityA.add(Foo);
    entities = world.query(Added(Foo));
    entities2 = world.query(LaterAdded(Foo));

    expect(entities.length).toBe(1);
    expect(entities2.length).toBe(1);
  });

  it('should populate Added queries for every trait in a world with many traits', () => {
    const Added = createAdded();
    // More traits than one mask generation holds, so every bit of a generation is tracked.
    const traits = Array.from({ length: 40 }, () => trait());
    const entity = world.spawn(...traits);

    for (const tracked of traits) expect(world.query(Added(tracked))).toContain(entity);
  });

  it('should combine Not and Added modifiers with logical AND', () => {
    const Added = createAdded();

    const entityA = world.spawn();
    const entityB = world.spawn();

    // No entities should match this query since while Not will match
    // all empty entities, Added will only match entities that have Foo.
    let entities = world.query(Added(Foo), Not(Bar));
    expect(entities.length).toBe(0);

    // Adding Foo to entityA should match the query as it has Foo added and not Bar.
    entityA.add(Foo);
    entities = world.query(Added(Foo), Not(Bar));
    expect(entities.first!).toBe(entityA);

    // Adding Foo and Bar to entityB should not match the query as it has Bar.
    entityB.add(Foo, Bar);
    entities = world.query(Added(Foo), Not(Bar));
    expect(entities.length).toBe(0);
  });

  it('should properly populate Removed queries when traits are removed', () => {
    const Removed = createRemoved();

    const entityA = world.spawn();
    const entityB = world.spawn();

    let entities = world.query(Removed(Foo));
    expect(entities.length).toBe(0);

    entityA.add(Foo);
    entityB.add(Foo);
    entities = world.query(Removed(Foo));
    expect(entities.length).toBe(0);

    entityA.remove(Foo);
    entities = world.query(Removed(Foo));
    expect(entities.first!).toBe(entityA);

    // Should work with traits added and removed in the same frame.
    entityA.add(Foo);
    entityA.remove(Foo);
    entities = world.query(Removed(Foo));
    expect(entities.first!).toBe(entityA);
    // Should track between Removed modifiers independently. A modifier created later still sees
    // the entities that lost the trait and have not regained it.
    const Removed2 = createRemoved();

    let entities2 = world.query(Removed2(Foo));
    expect(entities2.length).toBe(1);

    entityA.add(Foo);
    entityA.remove(Foo);
    entities = world.query(Removed(Foo));
    expect(entities.length).toBe(1);

    entityB.add(Foo);
    entityB.remove(Foo);
    entities = world.query(Removed(Foo));
    entities2 = world.query(Removed2(Foo));

    expect(entities.length).toBe(1);
    expect(entities2.length).toBe(2);
  });

  it('should populate Removed queries even if they are registered after the trait is removed', () => {
    const Removed = createRemoved();

    const entity = world.spawn(Foo);
    entity.remove(Foo);

    let entities = world.query(Removed(Foo));
    expect(entities.first!).toBe(entity);

    entity.add(Foo); // Reset

    const LaterRemoved = createRemoved();

    let entities2 = world.query(LaterRemoved(Foo));
    expect(entities2.length).toBe(0);

    entity.remove(Foo);
    entities = world.query(Removed(Foo));
    entities2 = world.query(LaterRemoved(Foo));

    expect(entities.length).toBe(1);
    expect(entities2.length).toBe(1);
  });

  it('should combine Not and Removed modifiers with logical AND', () => {
    const Removed = createRemoved();

    const entityA = world.spawn();
    const entityB = world.spawn();

    // Initially, no entities should match the query because no entities
    // have Foo removed even though Not matches all empty entities.
    let entities = world.query(Removed(Foo), Not(Bar));
    expect(entities.length).toBe(0);

    // Add Foo to entityA, then it should not match as it hasn't been removed yet.
    entityA.add(Foo);
    entities = world.query(Removed(Foo), Not(Bar));
    expect(entities.length).toBe(0);

    // Add Foo and Bar to entityB, it also should not match as
    // Foo hasn't been removed and it has Bar.
    entityB.add(Foo, Bar);
    entities = world.query(Removed(Foo), Not(Bar));
    expect(entities.length).toBe(0);

    // Remove Foo from entityA, it should now match as Foo is removed and
    // it does not have Bar.
    entityA.remove(Foo);
    entities = world.query(Removed(Foo), Not(Bar));
    expect(entities.first!).toBe(entityA);

    // Remove Foo from entityB, it should still not match as it has Bar.
    entityB.remove(Foo);
    entities = world.query(Removed(Foo), Not(Bar));
    expect(entities.length).toBe(0);
  });

  it('should combine Added and Removed modifiers with logical AND', () => {
    const Added = createAdded();
    const Removed = createRemoved();

    const entityA = world.spawn();
    const entityB = world.spawn();

    let entities = world.query(Added(Foo), Removed(Bar));
    expect(entities.length).toBe(0);

    // Add Foo to entityA and Bar to entityB.
    // Neither entity should match the query.
    entityA.add(Foo);
    entityB.add(Bar);
    entities = world.query(Added(Foo), Removed(Bar));
    expect(entities.length).toBe(0);

    // Remove Foo from entityA and remove Bar from entityB.
    // Neither entity should match the query.
    entityA.remove(Foo);
    entityB.remove(Bar);
    entities = world.query(Added(Foo), Removed(Bar));
    expect(entities.length).toBe(0);

    // Add Foo and Bar to entityA, then remove Bar.
    // This entity should now match the query.
    entityA.add(Foo, Bar);
    entityA.remove(Bar);
    entities = world.query(Added(Foo), Removed(Bar));
    expect(entities.first!).toBe(entityA);

    // Resets and can fill again.
    entityA.remove(Foo);
    entityA.add(Foo);
    entities = world.query(Added(Foo), Removed(Bar));
    expect(entities.length).toBe(0);

    // Add Foo to entityB and remove Bar.
    // This entity should now match the query.
    entityB.add(Foo, Bar);
    entityB.remove(Bar);
    entities = world.query(Added(Foo), Removed(Bar));
    expect(entities.first!).toBe(entityB);

    // Make sure changes in one entity do not leak to the other.
    const entityC = world.spawn();
    const entityD = world.spawn();

    entityC.add(Foo);
    entityD.add(Bar);
    entityD.remove(Bar);

    entities = world.query(Added(Foo), Removed(Bar));
    expect(entities.length).toBe(0);
  });

  it('tracks additions and writes after a Changed query is registered', () => {
    const Changed = createChanged();

    const entityA = world.spawn();

    let entities = world.query(Changed(Position));
    expect(entities.length).toBe(0);

    entityA.add(Position);
    entities = world.query(Changed(Position));
    expect(entities.toArray()).toEqual([entityA]);

    entityA.add(Position);
    expect(world.query(Changed(Position)).length).toBe(0);

    const entityB = world.spawn(Position);
    expect(world.query(Changed(Position)).toArray()).toEqual([entityB]);

    entityA.set(Position, { x: 5 });
    expect(world.query(Changed(Position)).toArray()).toEqual([entityA]);

    entityA.set(Position, { x: 6 }, false);
    expect(world.query(Changed(Position)).length).toBe(0);

    const positions = getStore(world, Position);
    const eidA = entityA & 0xfffff;
    positions.x[eidA >>> 10][eidA & 1023] = 10;
    positions.y[eidA >>> 10][eidA & 1023] = 20;

    // Set changed should populate the query.
    entityA.changed(Position);
    entities = world.query(Changed(Position));
    expect(entities.first!).toBe(entityA);

    // Querying again should not return the entity.
    entities = world.query(Changed(Position));
    expect(entities.length).toBe(0);

    // Should not populate the query if the trait is removed.
    entityA.remove(Position);
    expect(() => entityA.changed(Position)).toThrow(/\[TRAIT_PRESENT\]/);
    entities = world.query(Changed(Position));
    expect(entities.length).toBe(0);
  });

  it.each([
    ['Added', createAdded],
    ['Changed', createChanged],
  ] as const)('tracks %s regardless of spawn trait order', (_, createTracker) => {
    const Tracked = createTracker();
    expect(world.query(Tracked(Position), IsActive).length).toBe(0);

    const first = world.spawn(Position, IsActive);
    const second = world.spawn(IsActive, Position);
    expect(world.query(Tracked(Position), IsActive).toArray()).toEqual([first, second]);
    expect(world.query(Tracked(Position), IsActive).length).toBe(0);
  });

  it('seeds independent Changed readers from current membership', () => {
    const Changed = createChanged();
    const untouched = world.spawn(Position);
    const written = world.spawn(Position);
    written.set(Position, { x: 10 });
    const removed = world.spawn(Position);
    removed.remove(Position);
    world.spawn(Position).destroy();

    expect(world.query(Changed(Position)).toArray()).toEqual([untouched, written]);
    expect(world.query(Changed(Position)).length).toBe(0);

    written.set(Position, { x: 20 });
    const LaterChanged = createChanged();
    expect(world.query(LaterChanged(Position)).toArray()).toEqual([untouched, written]);
    expect(world.query(Changed(Position)).toArray()).toEqual([written]);
    expect(world.query(LaterChanged(Position)).length).toBe(0);

    const added = world.spawn(Position);
    expect(world.query(Changed(Position)).toArray()).toEqual([added]);
    expect(world.query(LaterChanged(Position)).toArray()).toEqual([added]);
  });

  it.each(['set', 'changed'] as const)('keeps %s tracking independent across worlds', (operation) => {
    const Value = trait({ value: 0 });
    const before = createWorld();
    const first = before.spawn(Value);

    const Changed = createChanged();
    const changed = Changed(Value);
    const after = createWorld();
    const second = after.spawn(Value);

    expect(before.query(changed).toArray()).toEqual([first]);
    expect(after.query(changed).toArray()).toEqual([second]);
    expect(before.query(changed).length).toBe(0);
    expect(after.query(changed).length).toBe(0);

    if (operation === 'set') first.set(Value, { value: 1 });
    else first.changed(Value);
    expect(before.query(changed).toArray()).toEqual([first]);
    expect(after.query(changed).length).toBe(0);
    before.destroy();
    after.destroy();
  });

  it('requires every Changed trait to be added or written', () => {
    const entity = world.spawn(Foo, Bar);

    const Changed = createChanged();

    expect(world.queryFirst(Changed(Foo), Changed(Bar))).toBe(entity);

    entity.changed(Foo);
    entity.changed(Bar);
    expect(world.queryFirst(Changed(Foo), Changed(Bar))).toBe(entity);

    entity.changed(Foo);
    expect(world.queryFirst(Changed(Foo), Changed(Bar))).toBeUndefined();

    entity.remove(Bar);
    entity.add(Bar);
    expect(world.queryFirst(Changed(Foo), Changed(Bar))).toBe(entity);
  });

  // @see https://github.com/pmndrs/koota/issues/115
  it('should not trigger Changed query when removing a different trait', () => {
    const Changed = createChanged();
    const entity = world.spawn(Position);

    // The first read includes current membership.
    expect(world.queryFirst(Changed(Position), Not(Foo))).toBe(entity);

    // Change Position
    entity.changed(Position);
    expect(world.queryFirst(Changed(Position), Not(Foo))).toBe(entity);

    // Query again - should be empty
    expect(world.queryFirst(Changed(Position), Not(Foo))).toBeUndefined();

    // Add and remove Foo - should be empty
    entity.add(Foo);
    entity.remove(Foo);
    expect(world.queryFirst(Changed(Position), Not(Foo))).toBeUndefined();
  });

  it('holds a write made outside a Changed query filter until the entity enters it', () => {
    const Changed = createChanged();
    const entity = world.spawn(Position);
    const unwritten = world.spawn(Position);
    expect(world.query(Foo, Changed(Position)).length).toBe(0);
    expect(world.query(Bar, Changed(Position)).length).toBe(0);

    entity.set(Position, { x: 1 });
    entity.set(Position, { x: 2 });
    expect(world.query(Foo, Changed(Position)).length).toBe(0);

    entity.add(Foo);
    unwritten.add(Foo);
    expect(world.query(Foo, Changed(Position)).toArray()).toEqual([entity]);
    expect(world.query(Foo, Changed(Position)).length).toBe(0);

    // Each reader holds the write on its own. The first has consumed it, the second has not.
    entity.remove(Foo);
    entity.add(Foo, Bar);
    expect(world.query(Foo, Changed(Position)).length).toBe(0);
    expect(world.query(Bar, Changed(Position)).toArray()).toEqual([entity]);

    entity.set(Position, { x: 3 });
    expect(world.query(Foo, Changed(Position)).toArray()).toEqual([entity]);
    expect(world.query(Bar, Changed(Position)).toArray()).toEqual([entity]);
  });

  it('tracks writes for a Changed query created after writes outside other filters', () => {
    const Changed = createChanged();
    const entity = world.spawn(Position, IsActive);
    expect(world.query(Foo, Changed(Position)).length).toBe(0);
    entity.set(Position, { x: 1 });

    const LaterChanged = createChanged();
    expect(world.query(IsActive, LaterChanged(Position)).toArray()).toEqual([entity]);
    expect(world.query(IsActive, LaterChanged(Position)).length).toBe(0);

    entity.set(Position, { x: 2 });
    expect(world.query(IsActive, LaterChanged(Position)).toArray()).toEqual([entity]);
    expect(world.query(Foo, Changed(Position)).length).toBe(0);

    entity.add(Foo);
    expect(world.query(Foo, Changed(Position)).toArray()).toEqual([entity]);
  });

  it.each([
    ['Added', createAdded],
    ['Removed', createRemoved],
  ] as const)(
    'combines Changed with %s in either parameter and event order',
    (kind, createTracker) => {
      const Tracked = createTracker();
      // Independent readers prevent the query cache from collapsing the parameter orders.
      const parameters = [
        [Tracked(Foo), createChanged()(Position)],
        [createChanged()(Position), Tracked(Foo)],
      ];
      const read = () => parameters.map((params) => world.query(...params).toArray());
      const entity = kind === 'Added' ? world.spawn(Position) : world.spawn(Position, Foo);
      const fire = () => (kind === 'Added' ? entity.add(Foo) : entity.remove(Foo));
      const undo = () => (kind === 'Added' ? entity.remove(Foo) : entity.add(Foo));
      expect(read()).toEqual([[], []]);

      // Current Position membership seeds Changed even when the other group does not match yet.
      fire();
      expect(read()).toEqual([[entity], [entity]]);
      expect(read()).toEqual([[], []]);

      undo();
      entity.set(Position, { x: 1 });
      expect(read()).toEqual([[], []]);
      fire();
      expect(read()).toEqual([[entity], [entity]]);

      undo();
      fire();
      expect(read()).toEqual([[], []]);
      entity.set(Position, { x: 2 });
      expect(read()).toEqual([[entity], [entity]]);
      expect(read()).toEqual([[], []]);
    }
  );

  it('should keep tracking after the world is reset', () => {
    const Added = createAdded();
    const Removed = createRemoved();
    const Changed = createChanged();

    world.spawn(Foo, Position);

    // Modifiers usually live at module level, so they outlive a reset.
    world.reset();

    expect(world.query(Added(Foo)).length).toBe(0);
    expect(world.query(Removed(Foo)).length).toBe(0);
    expect(world.query(Changed(Position)).length).toBe(0);

    const entity = world.spawn(Foo, Position);
    expect(world.query(Added(Foo)).first).toBe(entity);

    entity.changed(Position);
    expect(world.query(Changed(Position)).first).toBe(entity);

    entity.remove(Foo);
    expect(world.query(Removed(Foo)).first).toBe(entity);
  });

  it('each should work with Added modifier', () => {
    const Added = createAdded();
    const entity = world.spawn(Position({ x: 10, y: 20 }));

    world.query(Added(Position)).each((position) => {
      expect(position).toHaveProperty('x', 10);
      expect(position).toHaveProperty('y', 20);
      position.x = 100;
    });

    expect(entity.get(Position)!.x).toBe(100);
  });

  it('each should work with Added modifier combined with other traits', () => {
    const Added = createAdded();
    const Name = trait({ name: '' });
    const entity = world.spawn(Position({ x: 5, y: 15 }), Name({ name: 'test' }));

    world.query(Added(Position), Name).each((position, name) => {
      expect(position).toHaveProperty('x', 5);
      expect(position).toHaveProperty('y', 15);
      expect(name).toHaveProperty('name', 'test');
      position.x = 50;
      name.name = 'updated';
    });

    expect(entity.get(Position)!.x).toBe(50);
    expect(entity.get(Name)!.name).toBe('updated');
  });

  it('each should work with Changed modifier', () => {
    const Changed = createChanged();
    const entity = world.spawn(Position({ x: 1, y: 2 }));

    entity.changed(Position);

    world.query(Changed(Position)).each((position) => {
      expect(position).toHaveProperty('x', 1);
      expect(position).toHaveProperty('y', 2);
      position.x = 10;
    });

    expect(entity.get(Position)!.x).toBe(10);
  });

  it('reports writes made in each of another query to a Changed query', () => {
    const Changed = createChanged();
    const Velocity = trait({ x: 0, y: 0 });
    const moving = world.spawn(Position, Velocity({ x: 1, y: 0 }));
    world.spawn(Position, Velocity);
    expect(world.query(Changed(Position)).length).toBe(2);

    world.query(Position, Velocity).each((position, velocity) => {
      position.x += velocity.x;
    });

    // The entity with zero velocity wrote the value it already had.
    expect(world.query(Changed(Position)).toArray()).toEqual([moving]);
    expect(world.query(Changed(Position)).length).toBe(0);
  });

  it('each should work with Removed modifier', () => {
    const Removed = createRemoved();
    const Name = trait({ name: '' });
    const entity = world.spawn(Position({ x: 7, y: 8 }), Name({ name: 'keep' }));

    entity.remove(Position);

    // Removed modifier includes the removed trait in stores, plus any other queried traits
    world.query(Removed(Position), Name).each((position, name) => {
      // Position data may still be accessible (stale) even after removal
      expect(position).toHaveProperty('x');
      expect(name).toHaveProperty('name', 'keep');
      name.name = 'modified';
    });

    expect(entity.get(Name)!.name).toBe('modified');
  });

  it('should combine Or with Changed modifiers to match ANY changed trait', () => {
    const Changed = createChanged();

    const entityA = world.spawn(Position, Foo);
    const entityB = world.spawn(Position, Foo);
    const entityC = world.spawn(Position, Foo);

    // The first read includes current membership.
    let entities = world.query(Or(Changed(Position), Changed(Foo)));
    expect(entities.toArray()).toEqual([entityA, entityB, entityC]);

    // Change only Position on entityA
    entityA.changed(Position);
    entities = world.query(Or(Changed(Position), Changed(Foo)));
    expect(entities).toContain(entityA);
    expect(entities.length).toBe(1);

    // Change only Foo on entityB
    entityB.changed(Foo);
    entities = world.query(Or(Changed(Position), Changed(Foo)));
    expect(entities).toContain(entityB);
    expect(entities.length).toBe(1);

    // Change both on entityC - should still match
    entityC.changed(Position);
    entityC.changed(Foo);
    entities = world.query(Or(Changed(Position), Changed(Foo)));
    expect(entities).toContain(entityC);
    expect(entities.length).toBe(1);
  });

  it('should combine Or with Added modifiers to match ANY added trait', () => {
    const Added = createAdded();

    const entityA = world.spawn();
    const entityB = world.spawn();
    const entityC = world.spawn();

    // No additions yet
    let entities = world.query(Or(Added(Position), Added(Foo)));
    expect(entities.length).toBe(0);

    // Add only Position to entityA
    entityA.add(Position);
    entities = world.query(Or(Added(Position), Added(Foo)));
    expect(entities).toContain(entityA);
    expect(entities.length).toBe(1);

    // Add only Foo to entityB
    entityB.add(Foo);
    entities = world.query(Or(Added(Position), Added(Foo)));
    expect(entities).toContain(entityB);
    expect(entities.length).toBe(1);

    // Add both to entityC - should still match
    entityC.add(Position, Foo);
    entities = world.query(Or(Added(Position), Added(Foo)));
    expect(entities).toContain(entityC);
    expect(entities.length).toBe(1);
  });

  it('should combine Or with Removed modifiers to match ANY removed trait', () => {
    const Removed = createRemoved();

    const entityA = world.spawn(Position, Foo);
    const entityB = world.spawn(Position, Foo);
    const entityC = world.spawn(Position, Foo);

    // No removals yet
    let entities = world.query(Or(Removed(Position), Removed(Foo)));
    expect(entities.length).toBe(0);

    // Remove only Position from entityA
    entityA.remove(Position);
    entities = world.query(Or(Removed(Position), Removed(Foo)));
    expect(entities).toContain(entityA);
    expect(entities.length).toBe(1);

    // Remove only Foo from entityB
    entityB.remove(Foo);
    entities = world.query(Or(Removed(Position), Removed(Foo)));
    expect(entities).toContain(entityB);
    expect(entities.length).toBe(1);

    // Remove both from entityC - should still match
    entityC.remove(Position);
    entityC.remove(Foo);
    entities = world.query(Or(Removed(Position), Removed(Foo)));
    expect(entities).toContain(entityC);
    expect(entities.length).toBe(1);
  });

  it('should track Changed on a relation', () => {
    const ChildOf = relation({ store: { order: 0 } });
    const Changed = createChanged();

    const parentA = world.spawn();
    const parentB = world.spawn();
    const childA = world.spawn(ChildOf(parentA));
    const childB = world.spawn(ChildOf(parentB));

    expect(world.query(Changed(ChildOf)).toArray()).toEqual([childA, childB]);

    const childC = world.spawn(ChildOf(parentB));
    expect(world.query(Changed(ChildOf)).toArray()).toEqual([childC]);

    // Change only childA
    childA.set(ChildOf(parentA), { order: 1 });
    let changed = world.query(Changed(ChildOf));
    expect(changed).toHaveLength(1);
    expect(changed).toContain(childA);

    // Change both, query filtered by parentA pair
    childA.set(ChildOf(parentA), { order: 2 });
    childB.set(ChildOf(parentB), { order: 3 });
    const filteredA = world.query(Changed(ChildOf), ChildOf(parentA));
    expect(filteredA).toHaveLength(1);
    expect(filteredA).toContain(childA);
  });

  it('should track Added on a relation', () => {
    const ChildOf = relation();
    const Added = createAdded();

    const parentA = world.spawn();
    const parentB = world.spawn();

    const childA = world.spawn(ChildOf(parentA));
    const childB = world.spawn(ChildOf(parentB));
    const childC = world.spawn(ChildOf(parentA));

    // Filtered by parentA: only childA and childC target parentA
    const filteredA = world.query(Added(ChildOf), ChildOf(parentA));
    expect(filteredA).toHaveLength(2);
    expect(filteredA).toContain(childA);
    expect(filteredA).toContain(childC);
    expect(filteredA).not.toContain(childB);
  });

  it('should track Removed on a relation', () => {
    const ChildOf = relation();
    const Removed = createRemoved();

    const parentA = world.spawn();
    const parentB = world.spawn();
    const childA = world.spawn(ChildOf(parentA));
    const childB = world.spawn(ChildOf(parentB));

    // No removals yet
    expect(world.query(Removed(ChildOf))).toHaveLength(0);

    // Remove childA's relation
    childA.remove(ChildOf(parentA));
    let removed = world.query(Removed(ChildOf));
    expect(removed).toHaveLength(1);
    expect(removed).toContain(childA);

    // Remove childB
    childB.remove(ChildOf(parentB));
    removed = world.query(Removed(ChildOf));
    expect(removed).toHaveLength(1);
    expect(removed).toContain(childB);
  });

  it('each should work with Removed modifier for relations', () => {
    const Removed = createRemoved();
    const Contains = relation({ store: { amount: 0 } });

    const inventory = world.spawn();
    const gold = world.spawn();

    inventory.add(Contains(gold, { amount: 42 }));
    inventory.remove(Contains(gold));

    world.query(Removed(Contains), Contains(gold)).each((contains, entity) => {
      // Removed relation queries should still expose the removed pair's store data.
      expect(contains).toHaveProperty('amount', 42);
      // And its target
      expect(entity.targetFor(Contains)).toBe(gold);
    });
  });

  // @internal Tests internal implementation edge case with generation overflow
  it('[internal] should handle Changed modifier when trait registration causes generation overflow', () => {
    // Create a fresh world to control trait registration count
    const testWorld = createWorld();

    // IsExcluded is already registered (bitflag=2 after), register 29 more to get bitflag=2^30
    const fillerTraits = Array.from({ length: 29 }, () => trait());
    for (const t of fillerTraits) {
      testWorld.spawn(t);
    }

    // Create the modifier before registering traits in another generation.
    const Changed = createChanged();

    // Spawn an entity so entityIndex.dense is not empty (required to trigger the bug)
    const entity = testWorld.spawn();

    // Register the 31st trait to trigger overflow (bitflag 2^30 -> 2^31 -> overflow)
    const Trait31 = trait();
    entity.add(Trait31);

    // Now entityMasks has 2 generations, but changedMask only has 1

    // Create the 32nd trait - will be in generation 1
    const NewTrait = trait();

    // This should not throw "cannot read properties of undefined (reading '0')"
    // when accessing changedMask[generationId][eid] where generationId is 1 but changedMask only has index 0
    expect(() => {
      testWorld.query(Changed(NewTrait));
    }).not.toThrow();
  });

  it('Added tracks a specific pair', () => {
    const ChildOf = relation();
    const Added = createAdded();
    const red = world.spawn();
    const blue = world.spawn();
    const existing = world.spawn(ChildOf(red));

    // The first run reports the entities that already hold the pair.
    expect(world.query(Added(ChildOf(red))).toArray()).toEqual([existing]);
    expect(world.query(Added(ChildOf(red)))).toHaveLength(0);

    const ofRed = world.spawn(ChildOf(red));
    const ofBlue = world.spawn(ChildOf(blue));
    // Another target of the same relation is not this pair.
    existing.add(ChildOf(blue));

    expect(world.query(Added(ChildOf(red))).toArray()).toEqual([ofRed]);
    expect(world.query(Added(ChildOf(red)))).toHaveLength(0);

    // A pair added and removed between two runs is not reported.
    ofBlue.add(ChildOf(red));
    ofBlue.remove(ChildOf(red));
    expect(world.query(Added(ChildOf(red)))).toHaveLength(0);
  });

  it('Removed tracks a specific pair', () => {
    const ChildOf = relation();
    const Removed = createRemoved();
    const red = world.spawn();
    const blue = world.spawn();
    const removes = world.spawn(ChildOf(red));
    const dies = world.spawn(ChildOf(red));
    const stays = world.spawn(ChildOf(red), ChildOf(blue));
    const ofBlue = world.spawn(ChildOf(blue));

    expect(world.query(Removed(ChildOf(red)))).toHaveLength(0);

    removes.remove(ChildOf(red));
    dies.destroy();
    ofBlue.remove(ChildOf(blue));
    expect(world.query(Removed(ChildOf(red))).toArray()).toEqual([removes, dies]);
    expect(world.query(Removed(ChildOf(red)))).toHaveLength(0);

    // Adding the pair back before the next run takes the removal back.
    stays.remove(ChildOf(red));
    stays.add(ChildOf(red));
    expect(world.query(Removed(ChildOf(red)))).toHaveLength(0);

    // Destroying the target removes the pair from its sources.
    red.destroy();
    expect(world.query(Removed(ChildOf(red))).toArray()).toEqual([stays]);
  });

  it('Changed tracks writes to a specific pair', () => {
    const Likes = relation({ store: { amount: 0 } });
    const Changed = createChanged();
    const apples = world.spawn();
    const pears = world.spawn();
    const entity = world.spawn(Likes(apples), Likes(pears));

    // The first run reports the entities that already hold the pair.
    expect(world.query(Changed(Likes(apples))).toArray()).toEqual([entity]);
    expect(world.query(Changed(Likes(apples)))).toHaveLength(0);

    entity.set(Likes(pears), { amount: 2 });
    expect(world.query(Changed(Likes(apples)))).toHaveLength(0);

    entity.set(Likes(apples), { amount: 3 });
    expect(world.query(Changed(Likes(apples))).toArray()).toEqual([entity]);
    expect(world.query(Changed(Likes(apples)))).toHaveLength(0);
  });

  it('tracked pairs combine with Or and with other parameters', () => {
    const ChildOf = relation();
    const Added = createAdded();
    const red = world.spawn();
    const blue = world.spawn();
    const green = world.spawn();

    world.query(Or(Added(ChildOf(red)), Added(ChildOf(blue))));
    world.query(Foo, Added(ChildOf(red)));

    const ofRed = world.spawn(ChildOf(red));
    const ofBlue = world.spawn(Foo, ChildOf(blue));
    world.spawn(ChildOf(green));
    const fooOfRed = world.spawn(Foo, ChildOf(red));

    expect(world.query(Or(Added(ChildOf(red)), Added(ChildOf(blue)))).toArray()).toEqual([
      ofRed,
      ofBlue,
      fooOfRed,
    ]);
    expect(world.query(Foo, Added(ChildOf(red))).toArray()).toEqual([fooOfRed]);
  });

  it('a pair filter does not report an entity whose tracked trait is unchanged', () => {
    const ChildOf = relation();
    const Added = createAdded();
    const parent = world.spawn();
    const entity = world.spawn(Foo);

    expect(world.query(Added(Foo), ChildOf(parent))).toHaveLength(0);

    // Foo was added before the first run, so gaining the pair alone is not an addition of Foo.
    entity.add(ChildOf(parent));
    expect(world.query(Added(Foo), ChildOf(parent))).toHaveLength(0);

    const fresh = world.spawn(Foo, ChildOf(parent));
    expect(world.query(Added(Foo), ChildOf(parent)).toArray()).toEqual([fresh]);
  });

  it('an undone tracked event is not reported after a later membership change', () => {
    const ChildOf = relation();
    const Added = createAdded();
    const Removed = createRemoved();
    const parent = world.spawn();
    const other = world.spawn();

    world.query(Added(Foo), ChildOf(parent));
    world.query(Removed(Foo), Bar);
    world.query(Added(Foo), Not(ChildOf(parent)));

    // Foo is added and removed again before the pair makes the entity a candidate.
    const addedThenRemoved = world.spawn();
    addedThenRemoved.add(Foo);
    addedThenRemoved.remove(Foo);
    addedThenRemoved.add(ChildOf(parent));
    expect(world.query(Added(Foo), ChildOf(parent))).toHaveLength(0);

    // Foo is removed and added back before Bar makes the entity a candidate.
    const removedThenAdded = world.spawn(Foo);
    removedThenAdded.remove(Foo);
    removedThenAdded.add(Foo);
    removedThenAdded.add(Bar);
    expect(world.query(Removed(Foo), Bar)).toHaveLength(0);

    // A destroyed entity is not an addition, whatever pairs it loses on the way out.
    world.query(Added(Foo), Not(ChildOf(parent)));
    world.spawn(Foo, ChildOf(other)).destroy();
    expect(world.query(Added(Foo), Not(ChildOf(parent)))).toHaveLength(0);
  });

  it('Removed starts with the pairs live entities lost before the query existed', () => {
    const ChildOf = relation();
    const Removed = createRemoved();
    const red = world.spawn();
    const blue = world.spawn();

    const removed = world.spawn(ChildOf(red));
    removed.remove(ChildOf(red));
    const moved = world.spawn(ChildOf(red), ChildOf(blue));
    moved.remove(ChildOf(red));
    const returned = world.spawn(ChildOf(red));
    returned.remove(ChildOf(red));
    returned.add(ChildOf(red));
    const destroyed = world.spawn(ChildOf(red));
    destroyed.destroy();
    world.spawn(ChildOf(blue)).remove(ChildOf(blue));

    expect(world.query(Removed(ChildOf(red))).toArray()).toEqual([removed, moved, destroyed]);
    expect(world.query(Removed(ChildOf(red)))).toHaveLength(0);
  });

  it('pair removals older than the retention cap are not seeded', () => {
    const small = createWorld({ retain: 2 });
    const ChildOf = relation();
    const Removed = createRemoved();
    const parent = small.spawn();
    const children = [0, 1, 2].map(() => small.spawn(ChildOf(parent)));
    for (const child of children) child.remove(ChildOf(parent));

    expect(small.query(Removed(ChildOf(parent))).toArray()).toEqual([children[1], children[2]]);
    small.destroy();
  });

  it('queries with different tracking modifiers nested in Or stay separate', () => {
    const AddedFoo = createAdded();
    const AddedBar = createAdded();
    const foo = world.spawn(Foo);
    const bar = world.spawn(Bar);
    const neither = world.spawn();

    expect(world.query(Or(AddedFoo(Foo))).toArray()).toEqual([foo]);
    expect(world.query(Or(AddedBar(Bar))).toArray()).toEqual([bar]);
    // Nesting in Or is not the same query as the modifier alone, or as no parameters at all.
    expect(world.query(AddedFoo(Foo)).toArray()).toEqual([foo]);
    expect(world.query().toArray()).toEqual([foo, bar, neither]);
  });

  it('Or keeps an entity whose other tracked term still holds', () => {
    const ChildOf = relation();
    const Added = createAdded();
    const parent = world.spawn();
    world.query(Or(Added(ChildOf(parent)), Added(Foo)));
    world.query(Or(Added(Bar), Added(Foo)));

    // Foo is added and removed again, the other term of each query was still added.
    const child = world.spawn(ChildOf(parent), Foo);
    child.remove(Foo);
    const bar = world.spawn(Bar, Foo);
    bar.remove(Foo);

    expect(world.query(Or(Added(ChildOf(parent)), Added(Foo))).toArray()).toEqual([child]);
    expect(world.query(Or(Added(Bar), Added(Foo))).toArray()).toEqual([bar]);
  });

  it('a pair removal from before the query does not bypass its other terms', () => {
    const ChildOf = relation();
    const Removed = createRemoved();
    const parent = world.spawn();
    const entity = world.spawn(ChildOf(parent));
    entity.remove(ChildOf(parent));

    expect(world.query(Removed(ChildOf(parent)), Foo)).toHaveLength(0);

    // The entity lacked Foo when the query was seeded, so the old removal is not carried over.
    entity.add(Foo);
    expect(world.query(Removed(ChildOf(parent)), Foo)).toHaveLength(0);
  });

  it('a trait write is not taken for a change to a tracked pair', () => {
    const fresh = createWorld();
    const Health = trait({ value: 0 });
    const Likes = relation();
    const Changed = createChanged();
    const targets = Array.from({ length: 8 }, () => fresh.spawn());
    const entity = fresh.spawn(Health);
    const changed = () =>
      fresh.query(Changed(Health), Or(...targets.map((target) => Changed(Likes(target)))));

    expect(changed()).toHaveLength(0);

    // The entity holds none of the pairs, so writing Health satisfies only the first term.
    entity.set(Health, { value: 1 });
    expect(changed()).toHaveLength(0);

    entity.add(Likes(targets[3]));
    expect(changed().toArray()).toEqual([entity]);
    fresh.destroy();
  });
});
