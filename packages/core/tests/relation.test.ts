import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $internal,
  createAdded,
  createChanged,
  createQuery,
  createWorld,
  Not,
  Or,
  relation,
  required,
  trait,
} from '../src';

describe('Relation', () => {
  // Disable destroyed-entity retention so ids can be reused on the next spawn.
  const world = createWorld({ retain: 0 });

  beforeEach(() => {
    world.reset();
  });

  it('should create a relation', () => {
    const Relation = relation();
    expect(Object.keys(Relation)).toEqual([]);
  });

  it('should create a unique relations per target by default', () => {
    const Targeting = relation();
    const Attacking = relation();

    const player = world.spawn();
    const guard = world.spawn();
    const goblin = world.spawn(Targeting(player), Attacking(guard), Targeting(guard));

    let targets = goblin.targetsFor(Targeting);
    expect(targets.length).toBe(2);
    expect(targets).toContain(player);
    expect(targets).toContain(guard);

    targets = goblin.targetsFor(Attacking);
    expect(targets.length).toBe(1);
    expect(targets).toContain(guard);
  });

  it('should maintain exclusive relations', () => {
    const Targeting = relation({ exclusive: true });

    const player = world.spawn();
    const guard = world.spawn();
    const goblin = world.spawn(Targeting(player));

    let target = goblin.targetFor(Targeting);

    expect(target).toBe(player);
    expect(goblin.has(Targeting(player))).toBe(true);

    goblin.add(Targeting(guard));
    target = goblin.targetFor(Targeting);

    expect(target).toBe(guard);
    expect(goblin.has(Targeting(player))).toBe(false);
    expect(goblin.has(Targeting(guard))).toBe(true);

    goblin.add(Targeting(player));
    target = goblin.targetFor(Targeting);

    expect(target).toBe(player);
    expect(goblin.has(Targeting(player))).toBe(true);
    expect(goblin.has(Targeting(guard))).toBe(false);

    // Remove the target and check if the target is removed
    goblin.remove(Targeting(player));
    target = goblin.targetFor(Targeting);

    expect(target).toBe(undefined);
  });

  it('exclusive relations should allow targeting entity 0', () => {
    const Targeting = relation({ exclusive: true });
    const worldEntity = world.entities[0]!;
    const goblin = world.spawn(Targeting(worldEntity));

    expect(goblin.targetFor(Targeting)).toBe(worldEntity);
    expect(goblin.has(Targeting(worldEntity))).toBe(true);

    goblin.remove(Targeting(worldEntity));
    expect(goblin.targetFor(Targeting)).toBe(undefined);
  });

  it('should destroy orphaned sources when autoDestroy is orphan', () => {
    const ChildOf = relation({ autoDestroy: 'orphan' });

    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    const childChildA = world.spawn(ChildOf(child));
    const childChildB = world.spawn(ChildOf(child));
    const childChildC = world.spawn(ChildOf(childChildB));

    expect(world.has(parent)).toBe(true);
    expect(world.has(child)).toBe(true);
    expect(world.has(childChildA)).toBe(true);
    expect(world.has(childChildB)).toBe(true);
    expect(world.has(childChildC)).toBe(true);

    parent.destroy();

    expect(world.has(parent)).toBe(false);
    expect(world.has(child)).toBe(false);
    expect(world.has(childChildA)).toBe(false);
    expect(world.has(childChildB)).toBe(false);
    expect(world.has(childChildC)).toBe(false);
  });

  it('should destroy targets when autoDestroy is target', () => {
    const Contains = relation({ autoDestroy: 'target' });

    const container = world.spawn();
    const itemA = world.spawn();
    const itemB = world.spawn();

    container.add(Contains(itemA), Contains(itemB));

    expect(world.has(container)).toBe(true);
    expect(world.has(itemA)).toBe(true);
    expect(world.has(itemB)).toBe(true);

    container.destroy();

    expect(world.has(container)).toBe(false);
    expect(world.has(itemA)).toBe(false);
    expect(world.has(itemB)).toBe(false);
  });

  it('should create stores for relations', () => {
    const Contains = relation({ store: { amount: 0 } });

    const inventory = world.spawn();
    const gold = world.spawn();
    const silver = world.spawn();

    // Can add with initial values
    inventory.add(Contains(gold, { amount: 5 }));

    // Or add and set later
    inventory.add(Contains(silver));
    inventory.set(Contains(silver), { amount: 12 });

    expect(Contains(gold)).not.toBe(Contains(silver));
    expect(inventory.get(Contains(gold))!.amount).toBe(5);
    expect(inventory.get(Contains(silver))!.amount).toBe(12);
  });

  it('types pair values from the store', () => {
    const Contains = relation({ store: { amount: 0 } });
    const ChildOf = relation();
    const inventory = world.spawn();
    const gold = world.spawn();

    inventory.add(Contains(gold, { amount: 5 }), ChildOf(gold));
    expect(inventory.get(Contains(gold))).toEqual({ amount: 5 });

    // @ts-expect-error not a field of the store
    Contains(gold, { count: 5 });
    // @ts-expect-error the field is a number
    Contains(gold, { amount: 'five' });
    // @ts-expect-error a relation without a store takes no values
    ChildOf(gold, { amount: 5 });
  });

  it('requires a value for a required store field', () => {
    class Item {}
    const Holds = relation({ store: { item: required<Item>(), count: 1 } });
    const item = new Item();
    const target = world.spawn();

    const holder = world.spawn(Holds(target, { item }));
    const record = holder.get(Holds(target))!;
    const stored: Item = record.item;
    expect(stored).toBe(item);
    expect(record.count).toBe(1);

    // Reads and queries name the pair without values.
    expect(holder.has(Holds(target))).toBe(true);
    expect(world.query(Holds(target)).toArray()).toEqual([holder]);

    // @ts-expect-error the pair carries no values
    expect(() => world.spawn(Holds(target))).toThrow('REQUIRED_VALUE');
    // @ts-expect-error the required field is missing
    expect(() => world.spawn(Holds(target, { count: 2 }))).toThrow('REQUIRED_VALUE');
  });

  it('takes the record of a required store on add', () => {
    class Item {}
    const Holds = relation({ store: required<Item>() });
    const item = new Item();
    const target = world.spawn();

    const holder = world.spawn(Holds(target, item));
    expect(holder.get(Holds(target))).toBe(item);

    // @ts-expect-error the pair carries no record
    expect(() => world.spawn(Holds(target))).toThrow('REQUIRED_VALUE');
  });

  it('has no record for relations without a store', () => {
    const ChildOf = relation();
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    // Presence is answered by has, so a pair without data reads like a missing one.
    expect(child.has(ChildOf(parent))).toBe(true);
    expect(child.get(ChildOf(parent))).toBeUndefined();
    expect(ChildOf.record()).toBeUndefined();
  });

  it('should query all relations with a wildcard', () => {
    const Contains = relation();

    const inventory = world.spawn();
    const shop = world.spawn();
    const gold = world.spawn();
    const silver = world.spawn();

    inventory.add(Contains(gold));
    inventory.add(Contains(silver));

    let relations = world.query(Contains('*'));
    expect(relations.length).toBe(1);
    expect(relations).toContain(inventory);

    shop.add(Contains(gold));

    relations = world.query(Contains('*'));
    expect(relations.length).toBe(2);
    expect(relations).toContain(inventory);
    expect(relations).toContain(shop);

    // Wildcard '*' should return all entities with Contains relation
    relations = world.query(Contains('*'));
    expect(relations.length).toBe(2);
    expect(relations).toContain(inventory);
    expect(relations).toContain(shop);
  });

  it('should query a specific relation targeting an entity', () => {
    const ChildOf = relation();

    const root = world.spawn();
    const child1 = world.spawn(ChildOf(root));
    const child2 = world.spawn(ChildOf(root));
    const leaf = world.spawn(ChildOf(child2));

    const childrenOfRoot = world.query(ChildOf(root));
    const childrenOfChild2 = world.query(ChildOf(child2));

    expect(childrenOfRoot.length).toBe(2);
    expect(childrenOfRoot).toContain(child1);
    expect(childrenOfRoot).toContain(child2);

    expect(childrenOfChild2.length).toBe(1);
    expect(childrenOfChild2).toContain(leaf);
  });

  it('should correctly remove targets when they are destroyed', () => {
    const Likes = relation();

    const person = world.spawn();
    const apple = world.spawn();
    const banana = world.spawn();
    const cherry = world.spawn();
    const durian = world.spawn();

    // Add multiple relations with different targets
    person.add(Likes(apple));
    person.add(Likes(banana));
    person.add(Likes(cherry));
    person.add(Likes(durian));

    // Check that targetsFor returns all targets
    const initialTargets = person.targetsFor(Likes);
    expect(initialTargets.length).toBe(4);
    expect(initialTargets).toContain(apple);
    expect(initialTargets).toContain(banana);
    expect(initialTargets).toContain(cherry);
    expect(initialTargets).toContain(durian);

    // Destroy some of the targets
    banana.destroy();
    durian.destroy();

    // Check that targetsFor no longer includes the destroyed targets
    const remainingTargets = person.targetsFor(Likes);
    expect(remainingTargets.length).toBe(2);
    expect(remainingTargets).toContain(apple);
    expect(remainingTargets).toContain(cherry);
    expect(remainingTargets).not.toContain(banana);
    expect(remainingTargets).not.toContain(durian);

    // Verify that the destroyed entities are actually gone
    expect(world.has(banana)).toBe(false);
    expect(world.has(durian)).toBe(false);
    expect(world.has(apple)).toBe(true);
    expect(world.has(cherry)).toBe(true);
  });

  it('should keep target queries working after a target is destroyed', () => {
    const ChildOf = relation();
    const Mesh = trait();

    const kept = world.spawn();
    const dropped = world.spawn();
    const keptChild = world.spawn(Mesh, ChildOf(kept));
    const droppedChild = world.spawn(Mesh, ChildOf(dropped));
    const keptQuery = createQuery(Mesh, ChildOf(kept));
    const droppedQuery = createQuery(Mesh, ChildOf(dropped));
    const onRemove = vi.fn();
    world.onQueryRemove(droppedQuery, onRemove);

    expect([...world.query(keptQuery)]).toEqual([keptChild]);
    expect([...world.query(droppedQuery)]).toEqual([droppedChild]);
    expect(world.query(Mesh, ChildOf(kept), ChildOf(dropped)).length).toBe(0);

    dropped.destroy();
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith(droppedChild);
    expect(world.query(droppedQuery)).toHaveLength(0);

    const recycled = world.spawn();
    expect(recycled.id()).toBe(dropped.id());
    const recycledChild = world.spawn(Mesh, ChildOf(recycled));
    expect([...world.query(Mesh, ChildOf(recycled))]).toEqual([recycledChild]);
    expect(world.query(droppedQuery)).toHaveLength(0);

    const lateChild = world.spawn(Mesh, ChildOf(kept));
    expect([...world.query(keptQuery)]).toEqual([keptChild, lateChild]);
  });

  it('should update queries with multiple relations when a target is destroyed', () => {
    const Likes = relation();
    const Follows = relation();
    const Mesh = trait();
    const target = world.spawn();
    const otherTarget = world.spawn();
    const subject = world.spawn(Mesh, Likes(target), Follows(target), Likes(otherTarget));
    const combined = createQuery(Mesh, Likes(target), Follows(target));
    const shared = createQuery(Mesh, Likes(target), Likes(otherTarget));
    const kept = createQuery(Mesh, Likes(otherTarget));
    const wildcard = createQuery(Mesh, Likes('*'));
    const onRemove = vi.fn();
    world.onQueryRemove(combined, onRemove);

    expect([...world.query(combined)]).toEqual([subject]);
    expect([...world.query(shared)]).toEqual([subject]);
    expect([...world.query(kept)]).toEqual([subject]);
    expect([...world.query(wildcard)]).toEqual([subject]);

    target.destroy();

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith(subject);
    expect(world.query(combined)).toHaveLength(0);
    expect(world.query(shared)).toHaveLength(0);
    expect([...world.query(kept)]).toEqual([subject]);
    expect([...world.query(wildcard)]).toEqual([subject]);

    otherTarget.destroy();

    expect(world.query(kept)).toHaveLength(0);
    expect(world.query(wildcard)).toHaveLength(0);
  });

  it('should update exclusive relation queries when switching targets', () => {
    const Parent = relation({ exclusive: true });

    const parentA = world.spawn();
    const parentB = world.spawn();
    const child = world.spawn(Parent(parentA));

    expect(world.query(Parent(parentA))).toHaveLength(1);
    expect(world.query(Parent(parentA))).toContain(child);
    expect(world.query(Parent(parentB))).toHaveLength(0);

    child.add(Parent(parentB));

    expect(world.query(Parent(parentA))).toHaveLength(0);
    expect(world.query(Parent(parentB))).toHaveLength(1);
    expect(world.query(Parent(parentB))).toContain(child);

    child.remove(Parent(parentB));

    expect(world.query(Parent(parentA))).toHaveLength(0);
    expect(world.query(Parent(parentB))).toHaveLength(0);
  });

  it('removes the relation trait when its last target is destroyed', () => {
    const Targets = relation();

    const subject = world.spawn();
    const target = world.spawn();
    const otherTarget = world.spawn();

    subject.add(Targets(target));
    subject.add(Targets(otherTarget));

    // Sanity check: relation pair exists and base trait is present
    expect(subject.has(Targets(target))).toBe(true);
    expect(subject.has(Targets(otherTarget))).toBe(true);
    expect(subject.has(Targets('*'))).toBe(true);

    // Destroy the target entity
    target.destroy();

    // Should still have the other target
    expect(subject.has(Targets(target))).toBe(false);
    expect(subject.has(Targets(otherTarget))).toBe(true);
    expect(subject.targetsFor(Targets)).toEqual([otherTarget]);
    expect(subject.has(Targets('*'))).toBe(true);

    otherTarget.destroy();

    // The specific relation to that target should be removed...
    expect(subject.has(Targets(target))).toBe(false);
    expect(subject.has(Targets(otherTarget))).toBe(false);
    expect(subject.targetsFor(Targets)).toEqual([]);

    // ...and the underlying relation trait itself should be removed
    expect(subject.has(Targets('*'))).toBe(false);
  });

  it('should remove all relations with a wildcard', () => {
    const Likes = relation();

    const person = world.spawn();
    const apple = world.spawn();
    const banana = world.spawn();

    person.add(Likes(apple));
    person.add(Likes(banana));

    person.remove(Likes('*'));

    expect(person.has(Likes(apple))).toBe(false);
    expect(person.has(Likes(banana))).toBe(false);
  });

  it('should keep wildcard trait when removing one of multiple relations to the same target', () => {
    const Likes = relation();
    const Fears = relation();

    const person = world.spawn();
    const dragon = world.spawn();

    // Person both likes and fears the dragon
    person.add(Likes(dragon));
    person.add(Fears(dragon));

    // Person should have both relations
    expect(person.has(Fears(dragon))).toBe(true);
    expect(person.has(Likes(dragon))).toBe(true);

    // Remove only the Likes relation
    person.remove(Likes(dragon));

    // Person should still fear the dragon
    expect(person.has(Fears(dragon))).toBe(true);
    expect(person.has(Likes(dragon))).toBe(false);
  });

  it('should ignore data on re-add', () => {
    const Contains = relation({ store: { amount: 0 } });
    const container = world.spawn();
    const item = world.spawn();

    container.add(Contains(item, { amount: 5 }));
    expect(container.get(Contains(item))?.amount).toBe(5);

    // Re-adding with different data should be ignored
    container.add(Contains(item, { amount: 10 }));
    expect(container.get(Contains(item))?.amount).toBe(5);
  });

  // There is a hotpath for relation-only queries so this is a sanity check
  it('should support relation-only query with each', () => {
    const ChildOf = relation();

    const parent = world.spawn();
    const child1 = world.spawn(ChildOf(parent));
    const child2 = world.spawn(ChildOf(parent));
    const child3 = world.spawn(ChildOf(parent));

    const visited: number[] = [];

    world.query(ChildOf(parent)).each((entity, index) => {
      visited.push(entity);
      expect(index).toBe(visited.length - 1);
    });

    expect(visited.length).toBe(3);
    expect(visited).toContain(child1);
    expect(visited).toContain(child2);
    expect(visited).toContain(child3);
  });

  it('copies the sources of a concrete target on each query', () => {
    const ChildOf = relation();

    const parent = world.spawn();
    const otherParent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    // The relation index is copied, so the result does not change under the caller.
    const first = world.query(ChildOf(parent));
    const second = world.query(ChildOf(parent));
    expect(first).not.toBe(second);
    child.remove(ChildOf(parent));
    expect([...first]).toEqual([child]);

    expect(world.query(ChildOf(otherParent))).toHaveLength(0);
  });

  it('relation-only queries should tolerate relation removal during iteration', () => {
    const ChildOf = relation();

    const parent = world.spawn();
    const child1 = world.spawn(ChildOf(parent));
    const child2 = world.spawn(ChildOf(parent));
    const child3 = world.spawn(ChildOf(parent));

    const visited: number[] = [];
    world.query(ChildOf(parent)).each((entity) => {
      visited.push(entity);
      entity.remove(ChildOf(parent));
    });

    expect(visited).toHaveLength(3);
    expect(visited).toContain(child1);
    expect(visited).toContain(child2);
    expect(visited).toContain(child3);
    expect(world.query(ChildOf(parent))).toHaveLength(0);
  });

  it('keeps the query of each parent current as its children change', () => {
    const ChildOf = relation({ exclusive: true });
    const Weapon = trait();

    const parent = world.spawn();
    const other = world.spawn();
    const child = world.spawn(Weapon, ChildOf(parent));
    const armed = world.query(Weapon, ChildOf(parent));
    const armedOfOther = world.query(Weapon, ChildOf(other));
    expect(armed.toArray()).toEqual([child]);

    // A trait the query reads leaves and returns.
    child.remove(Weapon);
    expect(armed).toHaveLength(0);
    child.add(Weapon);
    expect(armed.toArray()).toEqual([child]);

    // The child moves to the other parent.
    child.add(ChildOf(other));
    expect(armed).toHaveLength(0);
    expect(armedOfOther.toArray()).toEqual([child]);

    child.destroy();
    expect(armedOfOther).toHaveLength(0);
  });

  it('queries should support relations with modifiers and traits', () => {
    const ChildOf = relation();
    const Weapon = trait();

    const parent = world.spawn();
    const child1 = world.spawn(ChildOf(parent), Weapon); // Has weapon
    const child2 = world.spawn(ChildOf(parent)); // No weapon

    // Query for children WITHOUT weapon
    const notResult = world.query(ChildOf(parent), Not(Weapon));

    expect(notResult.length).toBe(1);
    expect(notResult).toContain(child2);
    expect(notResult).not.toContain(child1);

    const weaponResult = world.query(ChildOf(parent), Weapon);
    expect(weaponResult.length).toBe(1);
    expect(weaponResult).toContain(child1);
    expect(weaponResult).not.toContain(child2);
  });

  it('Not excludes entities holding a specific pair', () => {
    const ChildOf = relation();
    const Unit = trait();

    const player = world.spawn();
    const enemy = world.spawn();
    const ofPlayer = world.spawn(Unit, ChildOf(player));
    const ofEnemy = world.spawn(Unit, ChildOf(enemy));
    const orphan = world.spawn(Unit);

    expect(world.query(Unit, Not(ChildOf(player))).toArray()).toEqual([ofEnemy, orphan]);
    // Other queries on the same relation keep their own results.
    expect(world.query(Unit, ChildOf(player)).toArray()).toEqual([ofPlayer]);
    expect(world.query(Unit, Not(ChildOf)).toArray()).toEqual([orphan]);
    expect(world.query(Unit, Not(ChildOf('*'))).toArray()).toEqual([orphan]);

    // Membership follows the pair as it is added and removed.
    orphan.add(ChildOf(player));
    ofPlayer.remove(ChildOf(player));
    expect(world.query(Unit, Not(ChildOf(player))).toArray()).toEqual([ofEnemy, ofPlayer]);

    // An entity spawned later is matched too.
    const late = world.spawn(Unit);
    expect(world.query(Unit, Not(ChildOf(player)))).toContain(late);
  });

  it('Not on a pair checks one target of a relation with many', () => {
    const Likes = relation();
    const Unit = trait();

    const apples = world.spawn();
    const pears = world.spawn();
    const both = world.spawn(Unit, Likes(apples), Likes(pears));
    const onlyPears = world.spawn(Unit, Likes(pears));

    expect(world.query(Unit, Not(Likes(apples))).toArray()).toEqual([onlyPears]);
    expect(world.query(Unit, Likes(pears), Not(Likes(apples))).toArray()).toEqual([onlyPears]);

    both.remove(Likes(apples));
    expect(world.query(Unit, Not(Likes(apples))).toArray()).toEqual([onlyPears, both]);
  });

  it('Not on a pair keeps matching after its target is destroyed', () => {
    const ChildOf = relation();
    const Unit = trait();

    const player = world.spawn();
    const child = world.spawn(Unit, ChildOf(player));
    const added = vi.fn();
    world.onQueryAdd([Unit, Not(ChildOf(player))], added);

    expect(world.query(Unit, Not(ChildOf(player)))).toHaveLength(0);

    player.destroy();

    expect(added).toHaveBeenCalledWith(child);
    expect(world.query(Unit, Not(ChildOf(player))).toArray()).toEqual([child]);
  });

  it('queries naming a destroyed target are dropped and rebuilt on demand', () => {
    const ChildOf = relation();
    const Added = createAdded();
    const Unit = trait();
    const unit = world.spawn(Unit);
    const cached = world[$internal].queriesHashMap.size;
    let team = world.spawn();

    for (let i = 0; i < 3; i++) {
      team = world.spawn();
      world.query(Unit, Not(ChildOf(team)));
      world.query(Unit, Or(ChildOf(team), Unit));
      world.query(Added(ChildOf(team)));
      team.destroy();
      // The world retains nothing, so the queries go with their target.
      expect(world[$internal].queriesHashMap.size).toBe(cached);
    }

    expect(world.query(Unit, Not(ChildOf(team))).toArray()).toEqual([unit]);
  });

  it('Not accepts a pair with a target query', () => {
    const ChildOf = relation();
    const Unit = trait();
    const IsHostile = trait();

    const hostile = world.spawn(IsHostile);
    const friendly = world.spawn();
    const ofHostile = world.spawn(Unit, ChildOf(hostile));
    const ofFriendly = world.spawn(Unit, ChildOf(friendly));

    expect(world.query(Unit, Not(ChildOf(IsHostile))).toArray()).toEqual([ofFriendly]);

    // The result follows the targets as they enter and leave the target query.
    friendly.add(IsHostile);
    hostile.remove(IsHostile);
    expect(world.query(Unit, Not(ChildOf(IsHostile))).toArray()).toEqual([ofHostile]);
  });

  it('Or matches entities holding any of its pairs or traits', () => {
    const ChildOf = relation();
    const Unit = trait();
    const IsBoss = trait();

    const red = world.spawn();
    const blue = world.spawn();
    const green = world.spawn();
    const ofRed = world.spawn(Unit, ChildOf(red));
    const ofBlue = world.spawn(Unit, ChildOf(blue));
    const ofGreen = world.spawn(Unit, ChildOf(green));
    const boss = world.spawn(Unit, IsBoss);
    world.spawn(Unit);

    expect(world.query(Unit, Or(ChildOf(red), ChildOf(blue))).toArray()).toEqual([ofRed, ofBlue]);
    expect(world.query(Unit, Or(ChildOf(red), IsBoss)).toArray()).toEqual([ofRed, boss]);

    // Membership follows both the pairs and the traits of the or term.
    ofGreen.add(ChildOf(red));
    boss.remove(IsBoss);
    ofBlue.add(IsBoss);
    expect(world.query(Unit, Or(ChildOf(red), IsBoss)).toArray()).toEqual([ofRed, ofGreen, ofBlue]);

    // Nothing enters through spawn alone when the or term is the whole query.
    world.spawn();
    expect(world.query(Or(ChildOf(red), IsBoss)).toArray()).toEqual([ofRed, ofBlue, ofGreen]);
  });

  it('should emit add/remove events for each pair', () => {
    const Likes = relation();

    const subject = world.spawn();
    const targetA = world.spawn();
    const targetB = world.spawn();

    const adds: Array<{ entity: number; target?: number }> = [];
    const removes: Array<{ entity: number; target?: number }> = [];

    const unsubAdd = world.onAdd(Likes, (e, t) => adds.push({ entity: e, target: t }));
    const unsubRemove = world.onRemove(Likes, (e, t) => removes.push({ entity: e, target: t }));

    // First add: fires add event for pair (subject, a)
    subject.add(Likes(targetA));
    expect(adds).toEqual([{ entity: subject, target: targetA }]);
    expect(removes).toEqual([]);

    // Second add: fires add event for pair (subject, b)
    subject.add(Likes(targetB));
    expect(adds).toEqual([
      { entity: subject, target: targetA },
      { entity: subject, target: targetB },
    ]);
    expect(subject.targetsFor(Likes).sort()).toEqual([targetA, targetB].sort());

    // Remove one target: fires remove event for pair (subject, a)
    subject.remove(Likes(targetA));
    expect(removes).toEqual([{ entity: subject, target: targetA }]);
    expect(subject.targetsFor(Likes)).toEqual([targetB]);

    unsubAdd();
    unsubRemove();
  });

  it('should emit add/remove events when switching an exclusive relation target', () => {
    const Parent = relation({ exclusive: true });

    const subject = world.spawn();
    const targetA = world.spawn();
    const targetB = world.spawn();

    const adds: Array<{ entity: number; target?: number }> = [];
    const removes: Array<{ entity: number; target?: number }> = [];

    const unsubAdd = world.onAdd(Parent, (e, t) => adds.push({ entity: e, target: t }));
    const unsubRemove = world.onRemove(Parent, (e, t) => removes.push({ entity: e, target: t }));

    // First add
    subject.add(Parent(targetA));
    expect(adds).toEqual([{ entity: subject, target: targetA }]);

    // Switch targets: should fire remove for old, add for new
    subject.add(Parent(targetB));
    expect(removes).toEqual([{ entity: subject, target: targetA }]);
    expect(adds).toEqual([
      { entity: subject, target: targetA },
      { entity: subject, target: targetB },
    ]);
    expect(subject.targetFor(Parent)).toBe(targetB);

    unsubAdd();
    unsubRemove();
  });

  it('onAdd should accept relation pairs and filter by target', () => {
    const ChildOf = relation();
    const parentA = world.spawn();
    const parentB = world.spawn();
    const childA = world.spawn();
    const childB = world.spawn();

    const onTrait = vi.fn();
    const onWildcard = vi.fn();
    const onParentA = vi.fn();

    const unsubTrait = world.onAdd(ChildOf, onTrait);
    const unsubWildcard = world.onAdd(ChildOf('*'), onWildcard);
    const unsubParentA = world.onAdd(ChildOf(parentA), onParentA);

    childA.add(ChildOf(parentA));
    childB.add(ChildOf(parentB));

    expect(onTrait).toHaveBeenCalledTimes(2);
    expect(onTrait).toHaveBeenNthCalledWith(1, childA, parentA);
    expect(onTrait).toHaveBeenNthCalledWith(2, childB, parentB);

    expect(onWildcard).toHaveBeenCalledTimes(2);
    expect(onWildcard).toHaveBeenNthCalledWith(1, childA, parentA);
    expect(onWildcard).toHaveBeenNthCalledWith(2, childB, parentB);

    expect(onParentA).toHaveBeenCalledTimes(1);
    expect(onParentA).toHaveBeenCalledWith(childA, parentA);

    unsubTrait();
    unsubWildcard();
    unsubParentA();
  });

  it('onRemove should accept relation pairs and filter by target', () => {
    const ChildOf = relation();
    const parentA = world.spawn();
    const parentB = world.spawn();
    const childA = world.spawn(ChildOf(parentA));
    const childB = world.spawn(ChildOf(parentB));

    const onTrait = vi.fn();
    const onWildcard = vi.fn();
    const onParentA = vi.fn();

    const unsubTrait = world.onRemove(ChildOf, onTrait);
    const unsubWildcard = world.onRemove(ChildOf('*'), onWildcard);
    const unsubParentA = world.onRemove(ChildOf(parentA), onParentA);

    childA.remove(ChildOf(parentA));
    childB.remove(ChildOf(parentB));

    expect(onTrait).toHaveBeenCalledTimes(2);
    expect(onTrait).toHaveBeenNthCalledWith(1, childA, parentA);
    expect(onTrait).toHaveBeenNthCalledWith(2, childB, parentB);

    expect(onWildcard).toHaveBeenCalledTimes(2);
    expect(onWildcard).toHaveBeenNthCalledWith(1, childA, parentA);
    expect(onWildcard).toHaveBeenNthCalledWith(2, childB, parentB);

    expect(onParentA).toHaveBeenCalledTimes(1);
    expect(onParentA).toHaveBeenCalledWith(childA, parentA);

    unsubTrait();
    unsubWildcard();
    unsubParentA();
  });

  it('onRemove callback should still have access to the relation target and its data', () => {
    const Contains = relation({ store: { amount: 0 } });

    const inventory = world.spawn();
    const gold = world.spawn();

    inventory.add(Contains(gold, { amount: 42 }));

    const removeCb = vi.fn((entity: typeof inventory, target: typeof gold) => {
      // The relation pair should still be present during onRemove
      expect(entity.has(Contains(target))).toBe(true);
      // The store data should still be readable
      expect(entity.get(Contains(target))?.amount).toBe(42);
      // targetFor should still resolve the target
      expect(entity.targetFor(Contains)).toBe(target);
    });

    world.onRemove(Contains, removeCb);
    inventory.remove(Contains(gold));

    expect(removeCb).toHaveBeenCalledTimes(1);
  });

  it('onChange should accept relation pairs and filter by target', () => {
    const ChildOf = relation({ store: { order: 0 } });
    const parentA = world.spawn();
    const parentB = world.spawn();
    const childA = world.spawn(ChildOf(parentA));
    const childB = world.spawn(ChildOf(parentB));

    const onTrait = vi.fn();
    const onWildcard = vi.fn();
    const onParentA = vi.fn();

    const unsubTrait = world.onChange(ChildOf, onTrait);
    const unsubWildcard = world.onChange(ChildOf('*'), onWildcard);
    const unsubParentA = world.onChange(ChildOf(parentA), onParentA);

    childA.set(ChildOf(parentA), { order: 1 });
    childB.set(ChildOf(parentB), { order: 2 });

    expect(onTrait).toHaveBeenCalledTimes(2);
    expect(onTrait).toHaveBeenNthCalledWith(1, childA, parentA);
    expect(onTrait).toHaveBeenNthCalledWith(2, childB, parentB);

    expect(onWildcard).toHaveBeenCalledTimes(2);
    expect(onWildcard).toHaveBeenNthCalledWith(1, childA, parentA);
    expect(onWildcard).toHaveBeenNthCalledWith(2, childB, parentB);

    expect(onParentA).toHaveBeenCalledTimes(1);
    expect(onParentA).toHaveBeenCalledWith(childA, parentA);

    unsubTrait();
    unsubWildcard();
    unsubParentA();
  });

  it.each([false, true])(
    'tracks every relation addition with initialized data, exclusive: %s',
    (exclusive) => {
      const Link = relation({ exclusive, store: { weight: 0 } });
      const first = world.spawn();
      const second = world.spawn();
      const entity = world.spawn();
      const Changed = createChanged();
      const Filtered = createChanged();
      world.query(Changed(Link));
      world.query(Filtered(Link), Link(second));
      const entered = vi.fn();
      world.onQueryAdd([Changed(Link)], entered);
      const changes = vi.fn();
      const filtered = vi.fn();
      world.onChange(Link, (source, target) => changes(source, target, source.get(Link(target))));
      entity.onChange(Link(second), filtered);

      entity.add(Link(first, { weight: 1 }));
      expect(entered).toHaveBeenCalledExactlyOnceWith(entity);
      expect(changes).toHaveBeenLastCalledWith(entity, first, { weight: 1 });
      expect(world.query(Changed(Link)).toArray()).toEqual([entity]);
      expect(world.query(Filtered(Link), Link(second)).length).toBe(0);
      expect(filtered).not.toHaveBeenCalled();

      entity.add(Link(second, { weight: 2 }));
      expect(entered).toHaveBeenCalledTimes(2);
      expect(changes).toHaveBeenLastCalledWith(entity, second, { weight: 2 });
      expect(world.query(Changed(Link)).toArray()).toEqual([entity]);
      expect(world.query(Filtered(Link), Link(second)).toArray()).toEqual([entity]);
      expect(filtered).toHaveBeenCalledExactlyOnceWith(entity, second);

      entity.add(Link(second, { weight: 99 }));
      entity.remove(Link(second));
      expect(changes).toHaveBeenCalledTimes(2);
      expect(filtered).toHaveBeenCalledTimes(1);
      expect(world.query(Changed(Link)).length).toBe(0);
    }
  );

  it('should emit change events when a relation is added or its store is updated', () => {
    const ChildOf = relation({ store: { order: 0 } });

    const changes: Array<{ entity: number; target?: number }> = [];
    const unsub = world.onChange(ChildOf, (e, t) => changes.push({ entity: e, target: t }));

    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    expect(changes).toEqual([{ entity: child, target: parent }]);

    // Update relation store
    child.set(ChildOf(parent), { order: 1 });
    expect(changes).toEqual([
      { entity: child, target: parent },
      { entity: child, target: parent },
    ]);

    // Update again
    child.set(ChildOf(parent), { order: 2 });
    expect(changes).toEqual([
      { entity: child, target: parent },
      { entity: child, target: parent },
      { entity: child, target: parent },
    ]);

    unsub();
  });
});
