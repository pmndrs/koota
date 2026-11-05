import { beforeEach, describe, expect, it } from 'vitest';
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
});
