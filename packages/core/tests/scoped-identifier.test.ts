import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createAdded,
  createChanged,
  createRemoved,
  createQuery,
  createWorld,
  identifier,
  Not,
  Or,
  relation,
  trait,
  type Entity,
  type World,
} from '../src';

describe('Scoped identifiers', () => {
  const ChildOf = relation({ exclusive: true });
  const Name = identifier({ scope: ChildOf });
  let world: World;

  beforeEach(() => {
    world = createWorld();
  });
  afterEach(() => {
    world.destroy();
  });

  it('resolves one name type from root to leaf and from an existing parent', () => {
    const robot = world.spawn(Name('robot'));
    const arm = world.spawn(Name('arm'), ChildOf(robot));
    const motor = world.spawn(Name('motor'), ChildOf(arm));
    const other = world.spawn(Name('other'));
    const otherArm = world.spawn(ChildOf(other), Name('arm'));
    const otherMotor = world.spawn(ChildOf(otherArm), Name('motor'));
    expect(world.lookup(Name('robot'), Name('arm'), Name('motor'))).toBe(motor);
    expect(world.lookup(Name('other'), Name('arm'), Name('motor'))).toBe(otherMotor);
    expect(world.lookup(robot, Name('arm'), Name('motor'))).toBe(motor);
    expect(world.lookup(arm, Name('motor'))).toBe(motor);
    expect(world.lookup(Name('motor'))).toBeUndefined();
    expect(world.lookup(robot, Name('motor'))).toBeUndefined();
    expect(world.lookup(Name('missing'), Name('arm'))).toBeUndefined();
    expect(world.lookup(Name('robot'), Name('missing'), Name('motor'))).toBeUndefined();
    expect(motor.targetFor(Name)).toBe('motor');
    expect(motor.has(Name('motor'))).toBe(true);
    expectTypeOf(world.lookup(robot, Name('arm'))).toEqualTypeOf<Entity | undefined>();
  });

  it('uses a global numeric robot ID followed by a scoped local name', () => {
    const RobotId = identifier<number>();
    const robot = world.spawn(RobotId(101));
    const other = world.spawn(RobotId(102));
    const motor = world.spawn(Name('motor'), ChildOf(robot));
    const otherMotor = world.spawn(Name('motor'), ChildOf(other));
    expect(world.lookup(RobotId(101), Name('motor'))).toBe(motor);
    expect(world.lookup(RobotId(102), Name('motor'))).toBe(otherMotor);
    robot.add(RobotId(103));
    expect(world.lookup(RobotId(101), Name('motor'))).toBeUndefined();
    expect(world.lookup(RobotId(103), Name('motor'))).toBe(motor);
  });

  it('applies a following parent pair before claiming a root name in spawn and add', () => {
    const root = world.spawn(Name('motor'));
    const robot = world.spawn(Name('robot'));
    const motor = world.spawn(Name('motor'), ChildOf(robot));
    const other = world.spawn(Name('other'));
    const added = world.spawn();
    added.add(Name('motor'), ChildOf(other));
    expect(world.lookup(Name('motor'))).toBe(root);
    expect(world.lookup(robot, Name('motor'))).toBe(motor);
    expect(world.lookup(other, Name('motor'))).toBe(added);
  });

  it('reparents entire named subtrees without renaming descendants', () => {
    const a = world.spawn(Name('a'));
    const b = world.spawn(Name('b'));
    world.spawn(Name('arm'));
    const arm = world.spawn(Name('arm'), ChildOf(a));
    const motor = world.spawn(Name('motor'), ChildOf(arm));
    const events = vi.fn(() => {
      expect(world.lookup(a, Name('arm'))).toBeUndefined();
      expect(world.lookup(b, Name('arm'))).toBe(arm);
      expect(arm.targetFor(ChildOf)).toBe(b);
    });
    const stopRemove = arm.onRemove(ChildOf, events);
    const stopAdd = arm.onAdd(ChildOf, events);
    arm.add(ChildOf(b));
    expect(events).toHaveBeenCalledTimes(2);
    stopRemove();
    stopAdd();
    expect(world.lookup(Name('a'), Name('arm'), Name('motor'))).toBeUndefined();
    expect(world.lookup(Name('b'), Name('arm'), Name('motor'))).toBe(motor);
    b.add(Name('renamed'));
    expect(world.lookup(Name('renamed'), Name('arm'), Name('motor'))).toBe(motor);
  });

  it('validates every identifier before refusing a conflicting reparent', () => {
    const Port = identifier<number>({ scope: ChildOf });
    const a = world.spawn(Name('a'));
    const b = world.spawn(Name('b'));
    const motor = world.spawn(ChildOf(a), Name('motor'), Port(1));
    const occupied = world.spawn(ChildOf(b), Name('other'), Port(1));
    const events = vi.fn();
    motor.onAdd(ChildOf, events);
    motor.onRemove(ChildOf, events);
    expect(() => motor.add(ChildOf(b))).toThrow(/IDENTIFIER_TAKEN/);
    expect(motor.targetFor(ChildOf)).toBe(a);
    expect(world.lookup(a, Name('motor'))).toBe(motor);
    expect(world.lookup(a, Port(1))).toBe(motor);
    expect(world.lookup(b, Name('motor'))).toBeUndefined();
    expect(world.lookup(b, Port(1))).toBe(occupied);
    expect(events).not.toHaveBeenCalled();
  });

  it('refuses sibling collisions when assigning or renaming and allows reuse after removal', () => {
    const parent = world.spawn();
    const motor = world.spawn(ChildOf(parent), Name('motor'));
    const other = world.spawn(ChildOf(parent), Name('other'));
    expect(() => other.add(Name('motor'))).toThrow(/IDENTIFIER_TAKEN/);
    expect(world.lookup(parent, Name('motor'))).toBe(motor);
    expect(world.lookup(parent, Name('other'))).toBe(other);
    motor.remove(Name('other'));
    expect(world.lookup(parent, Name('motor'))).toBe(motor);
    motor.remove(Name);
    other.add(Name('motor'));
    expect(world.lookup(parent, Name('motor'))).toBe(other);
    expect(world.lookup(parent, Name('other'))).toBeUndefined();
  });

  it('moves to root when its parent pair is removed and refuses root collisions', () => {
    const parent = world.spawn();
    const motor = world.spawn(ChildOf(parent), Name('motor'));
    const root = world.spawn(Name('motor'));
    const events = vi.fn();
    motor.onRemove(ChildOf, events);
    expect(() => motor.remove(ChildOf('*'))).toThrow(/IDENTIFIER_TAKEN/);
    expect(motor.targetFor(ChildOf)).toBe(parent);
    expect(events).not.toHaveBeenCalled();
    root.remove(Name);
    motor.remove(ChildOf(parent));
    expect(world.lookup(Name('motor'))).toBe(motor);
    expect(world.lookup(parent, Name('motor'))).toBeUndefined();
    expect(motor.has(ChildOf('*'))).toBe(false);
  });

  it('queries local names across scopes and combines them with parent filters', () => {
    const a = world.spawn();
    const b = world.spawn();
    const query = createQuery(Name('motor'));
    const aQuery = createQuery(Name('motor'), ChildOf(a));
    const entered = vi.fn();
    const left = vi.fn();
    world.onEnter(query, entered);
    world.onExit(query, left);
    const motor = world.spawn(Name('motor'), ChildOf(a));
    const other = world.spawn(Name('motor'), ChildOf(b));
    expect(world.query(query).toArray()).toEqual([motor, other]);
    expect(world.query(Name('motor')).toArray()).toEqual([motor, other]);
    expect(world.query(aQuery).toArray()).toEqual([motor]);
    other.add(Name('other'));
    motor.add(ChildOf(b));
    expect(world.query(aQuery).toArray()).toEqual([]);
    expect(world.query(query).toArray()).toEqual([motor]);
    expect(entered).toHaveBeenCalledTimes(2);
    expect(left).toHaveBeenCalledTimes(1);
  });

  it('composes named paths with component queries and known parent entities', () => {
    const RobotId = identifier<number>();
    const Position = trait({ x: 0 });
    const robot = world.spawn(RobotId(101));
    const other = world.spawn(RobotId(102));
    const arm = world.spawn(ChildOf(robot), Name('arm'));
    const otherArm = world.spawn(ChildOf(other), Name('arm'));
    const motor = world.spawn(ChildOf(arm), Name('motor'), Position);
    const otherMotor = world.spawn(ChildOf(otherArm), Name('motor'), Position);
    const query = createQuery(Name('motor'), ChildOf(Name('arm'), ChildOf(RobotId(101))), Position);

    expect(world.query(Name('motor'), ChildOf(arm), Position).toArray()).toEqual([motor]);
    expect(
      world.query(Name('motor'), ChildOf(Name('arm'), ChildOf(robot)), Position).toArray()
    ).toEqual([motor]);
    expect(world.query(query).toArray()).toEqual([motor]);
    expect(world.queryFirst(query)).toBe(motor);
    // Required relation filters pass their target before the trait records.
    world.query(query).each((parent, position, entity) => {
      expectTypeOf(parent).toEqualTypeOf<Entity>();
      expectTypeOf(position).toEqualTypeOf<{ x: number }>();
      expectTypeOf(entity).toEqualTypeOf<Entity>();
      expect(parent).toBe(arm);
      position.x = 7;
    });
    expect(motor.get(Position)?.x).toBe(7);
    expect(otherMotor.get(Position)?.x).toBe(0);

    robot.add(RobotId(103));
    expect(world.query(query)).toHaveLength(0);
    other.add(RobotId(101));
    expect(world.query(query).toArray()).toEqual([otherMotor]);
    otherMotor.remove(Position);
    expect(world.query(query)).toHaveLength(0);
  });

  it('keeps root-anchored path queries live through ancestor renames and moves', () => {
    const robot = world.spawn(Name('robot'));
    const arm = world.spawn(ChildOf(robot), Name('arm'));
    const motor = world.spawn(ChildOf(arm), Name('motor'));
    const container = world.spawn();
    const nestedRobot = world.spawn(ChildOf(container), Name('robot'));
    const nestedArm = world.spawn(ChildOf(nestedRobot), Name('arm'));
    const nestedMotor = world.spawn(ChildOf(nestedArm), Name('motor'));
    const query = createQuery(
      Name('motor'),
      ChildOf(Name('arm'), ChildOf(Name('robot'), Not(ChildOf('*'))))
    );
    const entered = vi.fn();
    const left = vi.fn();
    world.onEnter(query, entered);
    world.onExit(query, left);
    const view = world.query(query);

    expect(view.toArray()).toEqual([motor]);
    expect(new Set(world.query(Name('motor'), ChildOf(Name('arm'), ChildOf(Name('robot')))))).toEqual(
      new Set([motor, nestedMotor])
    );
    arm.add(Name('renamed'));
    expect(view).toHaveLength(0);
    arm.add(Name('arm'));
    expect(view.toArray()).toEqual([motor]);

    const empty = world.spawn();
    robot.add(ChildOf(empty));
    expect(view).toHaveLength(0);
    robot.remove(ChildOf(empty));
    expect(view.toArray()).toEqual([motor]);
    expect(entered.mock.calls).toEqual([[motor], [motor]]);
    expect(left.mock.calls).toEqual([[motor], [motor]]);
  });

  it('updates keyed relation queries alongside broader filters when moving', () => {
    const Port = identifier<number>({ scope: ChildOf });
    const first = world.spawn();
    const second = world.spawn();
    const blocked = world.spawn();
    const motor = world.spawn(ChildOf(first), Name('motor'), Port(1));
    const named = world.query(Name('motor'), ChildOf(first));
    const numbered = world.query(Port(1), ChildOf(first));
    const either = world.query(Name('motor'), Or(ChildOf(first), ChildOf(second)));
    const except = world.query(Name('motor'), Not(ChildOf(first)));
    const mixed = world.query(Name('motor'), Not(ChildOf(blocked)), ChildOf(first));

    expect(named.toArray()).toEqual([motor]);
    expect(numbered.toArray()).toEqual([motor]);
    expect(either.toArray()).toEqual([motor]);
    expect(except).toHaveLength(0);
    expect(mixed.toArray()).toEqual([motor]);
    motor.add(ChildOf(second));
    expect(named).toHaveLength(0);
    expect(numbered).toHaveLength(0);
    expect(either.toArray()).toEqual([motor]);
    expect(except.toArray()).toEqual([motor]);
    expect(mixed).toHaveLength(0);
  });

  it('allows a keyed query callback to drop its target and reparent again', () => {
    const first = world.spawn();
    const second = world.spawn();
    const third = world.spawn();
    const motor = world.spawn(ChildOf(first), Name('motor'));
    const leaving = createQuery(Name('motor'), ChildOf(first));
    const middle = createQuery(Name('motor'), ChildOf(second));
    const arriving = createQuery(Name('motor'), ChildOf(third));
    const firstView = world.query(leaving);
    const middleAdded = vi.fn();
    const arrived = vi.fn();
    world.onEnter(middle, middleAdded);
    world.onEnter(arriving, arrived);
    world.onExit(leaving, () => {
      first.destroy();
      motor.add(ChildOf(third));
    });

    motor.add(ChildOf(second));
    expect(motor.targetFor(ChildOf)).toBe(third);
    expect(firstView).toHaveLength(0);
    expect(world.query(middle)).toHaveLength(0);
    expect(world.query(arriving).toArray()).toEqual([motor]);
    expect(world.lookup(third, Name('motor'))).toBe(motor);
    // The callback's reparent is deferred, so the entity passes through the middle parent first.
    expect(middleAdded.mock.calls).toEqual([[motor]]);
    expect(arrived.mock.calls).toEqual([[motor]]);
  });

  it('keeps shared keys and lookupAll inside their requested scope', () => {
    const Label = identifier({ scope: ChildOf, exclusive: false });
    const a = world.spawn(Name('a'));
    const b = world.spawn(Name('b'));
    const first = world.spawn(ChildOf(a), Label('sensor'));
    const second = world.spawn(ChildOf(a), Label('sensor'));
    const third = world.spawn(ChildOf(b), Label('sensor'));
    expect(world.lookupAll(Name('a'), Label('sensor'))).toEqual([first, second]);
    expect(world.lookupAll(b, Label('sensor'))).toEqual([third]);
    expect(world.lookupAll(Label('sensor'))).toEqual([]);
    first.add(ChildOf(b));
    second.destroy();
    expect(world.lookupAll(a, Label('sensor'))).toEqual([]);
    expect(new Set(world.lookupAll(b, Label('sensor')))).toEqual(new Set([first, third]));
    first.remove(Label);
    expect(world.lookupAll(b, Label('sensor'))).toEqual([third]);
  });

  it('follows the relation cascade policy through destruction and world reset', () => {
    const Owns = relation({ exclusive: true, autoDestroy: 'orphan' });
    const Label = identifier({ scope: Owns });
    const robot = world.spawn(Label('robot'));
    const motor = world.spawn(Label('motor'), Owns(robot));
    robot.destroy();
    expect(world.has(motor)).toBe(false);
    expect(world.lookup(robot, Label('motor'))).toBeUndefined();
    expect(world.lookup(Label('motor'))).toBeUndefined();
    expect(world.query(Label('motor')).toArray()).toEqual([]);
    const replacement = world.spawn(Label('robot'));
    const next = world.spawn(Label('motor'), Owns(replacement));
    expect(world.lookup(Label('robot'), Label('motor'))).toBe(next);
    world.reset();
    expect(world.lookup(Label('robot'), Label('motor'))).toBeUndefined();
  });

  it('moves orphans to the root scope and releases keys already taken there', () => {
    const robot = world.spawn(Name('robot'));
    const arm = world.spawn(Name('arm'), ChildOf(robot));
    const motor = world.spawn(Name('motor'), ChildOf(arm));
    const taken = world.spawn(Name('arm'));
    const removed: unknown[] = [];
    arm.onRemove(Name, (_, key) => removed.push(key));
    robot.destroy();
    expect(world.has(arm)).toBe(true);
    expect(arm.targetFor(ChildOf)).toBeUndefined();
    expect(arm.has(Name)).toBe(false);
    expect(removed).toEqual(['arm']);
    expect(world.lookup(Name('arm'))).toBe(taken);
    expect(world.lookup(arm, Name('motor'))).toBe(motor);
    arm.add(Name('spare'));
    expect(world.lookup(Name('spare'))).toBe(arm);
    arm.destroy();
    expect(world.has(motor)).toBe(true);
    expect(motor.targetFor(ChildOf)).toBeUndefined();
    expect(world.lookup(Name('motor'))).toBe(motor);
  });

  it('resolves paths of any length for lookup and lookupAll', () => {
    // Keys are literal scalars, so punctuation is never parsed as a path.
    const a = world.spawn(Name('a.1'));
    const b = world.spawn(Name('b'), ChildOf(a));
    const c = world.spawn(Name('c'), ChildOf(b));
    const d = world.spawn(Name('d'), ChildOf(c));
    const e = world.spawn(Name('e'), ChildOf(d));
    const f = world.spawn(Name('f'), ChildOf(e));
    expect(world.lookup(Name('a.1'), Name('b'), Name('c'), Name('d'))).toBe(d);
    expect(world.lookup(Name('a.1'), Name('b'), Name('c'), Name('d'), Name('e'))).toBe(e);
    expect(world.lookup(a, Name('b'), Name('c'), Name('d'), Name('e'), Name('f'))).toBe(f);
    expect(world.lookup(Name('a.1'), Name('b'), Name('x'), Name('d'), Name('e'))).toBeUndefined();
    expect(world.lookupAll(a, Name('b'))).toEqual([b]);
    expect(world.lookupAll(Name('a.1'), Name('b'), Name('c'))).toEqual([c]);
    expect(world.lookupAll(Name('a.1'), Name('b'), Name('c'), Name('d'), Name('e'))).toEqual([e]);
    expect(world.lookupAll(b, Name('c'), Name('d'), Name('e'), Name('f'))).toEqual([f]);
    expect(world.lookupAll(Name('a.1'), Name('x'), Name('c'), Name('d'), Name('e'))).toEqual([]);
  });

  it('assigns a name in the scope the entity ends up with when the parent pair changes', () => {
    const first = world.spawn(Name('first'));
    const second = world.spawn(Name('second'));
    const stop = world.onEnter([ChildOf(first)], (entity) => entity.add(ChildOf(second)));
    const motor = world.spawn(Name('motor'), ChildOf(first));
    stop();
    expect(motor.targetFor(ChildOf)).toBe(second);
    expect(world.lookup(second, Name('motor'))).toBe(motor);
    expect(world.lookup(first, Name('motor'))).toBeUndefined();
    expect(world.lookup(Name('motor'))).toBeUndefined();
    const dead = world.spawn();
    dead.destroy();
    expect(() => world.spawn(Name('loose'), ChildOf(dead))).toThrow(/ENTITY_ALIVE/);
  });

  it('requires an exclusive scope and leaves the relation graph unconstrained', () => {
    expect(() => identifier({ scope: relation() })).toThrow(/IDENTIFIER_SCOPE/);
    const root = world.spawn(Name('root'));
    const child = world.spawn(ChildOf(root), Name('child'));
    root.add(ChildOf(child));
    expect(root.targetFor(ChildOf)).toBe(child);
    expect(child.targetFor(ChildOf)).toBe(root);
    expect(world.lookup(child, Name('root'))).toBe(root);
    expect(world.lookup(root, Name('child'))).toBe(child);
    expect(world.lookup(Name('root'))).toBeUndefined();
    expect(world.lookup(Name('child'))).toBeUndefined();
  });

  it('tracks a reparent as a relation change without assigning the local name again', () => {
    const Added = createAdded();
    const Removed = createRemoved();
    const Changed = createChanged();
    const first = world.spawn();
    const second = world.spawn();
    const motor = world.spawn(ChildOf(first), Name('motor'));
    world.query(Added(ChildOf(second)));
    world.query(Removed(ChildOf(first)));
    world.query(Changed(ChildOf));
    world.query(Changed(Name));
    motor.add(ChildOf(second));
    expect(world.query(Added(ChildOf(second))).toArray()).toEqual([motor]);
    expect(world.query(Removed(ChildOf(first))).toArray()).toEqual([motor]);
    expect(world.query(Changed(ChildOf)).toArray()).toEqual([motor]);
    expect(world.query(Changed(Name)).toArray()).toEqual([]);
  });

  it('preserves and tracks a reparent performed by a removal callback', () => {
    const Changed = createChanged();
    const first = world.spawn();
    const second = world.spawn();
    const third = world.spawn();
    const motor = world.spawn(ChildOf(first), Name('motor'));
    const secondView = world.query(createQuery(Name('motor'), ChildOf(second)));
    world.query(Changed(ChildOf));
    const stop = motor.onRemove(ChildOf(first), () => motor.add(ChildOf(third)));
    motor.add(ChildOf(second));
    stop();
    expect(motor.targetFor(ChildOf)).toBe(third);
    expect(world.lookup(first, Name('motor'))).toBeUndefined();
    expect(world.lookup(second, Name('motor'))).toBeUndefined();
    expect(world.lookup(third, Name('motor'))).toBe(motor);
    expect(secondView).toHaveLength(0);
    expect(world.query(Changed(ChildOf)).toArray()).toEqual([motor]);
  });

  it('rejects a child deferred onto a parent once its destruction completes', () => {
    const parent = world.spawn(Name('robot'));
    const child = world.spawn(Name('motor'));
    world.onEntityDestroy((entity) => {
      if (entity === parent) child.add(ChildOf(parent));
    });
    expect(() => parent.destroy()).toThrow(/ENTITY_ALIVE/);
    expect(parent.isAlive()).toBe(false);
    expect(child.targetFor(ChildOf)).toBeUndefined();
    expect(world.lookup(Name('motor'))).toBe(child);
  });

  it('tracks a replacement parent added by a query-removal callback', () => {
    const Changed = createChanged();
    const first = world.spawn();
    const second = world.spawn();
    const motor = world.spawn(ChildOf(first), Name('motor'));
    world.query(Changed(ChildOf));
    const stop = world.onExit([ChildOf(first)], (entity) => entity.add(ChildOf(second)));
    motor.remove(ChildOf(first));
    stop();
    expect(motor.targetFor(ChildOf)).toBe(second);
    expect(world.lookup(Name('motor'))).toBeUndefined();
    expect(world.lookup(second, Name('motor'))).toBe(motor);
    expect(world.query(Changed(ChildOf)).toArray()).toEqual([motor]);
  });
});
