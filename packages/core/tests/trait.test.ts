import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createChanged, createWorld, type Entity, getStore, relation, trait } from '../src';

class TestClass {
  public name: string;

  constructor(name = 'TestClass') {
    this.name = name;
  }
}

const Position = trait({ x: 0, y: 0 });

const Test = trait({
  current: 1,
  test: 'hello',
  bool: true,
  arr: () => ['a', 'b', 'c'],
  class: () => new TestClass(),
  bigInt: 1n,
});

const Tag = trait();

type Vec3 = [x: number, y: number, z: number];

describe('Trait', () => {
  const world = createWorld();

  beforeEach(() => {
    world.reset();
  });

  it('should create a trait', () => {
    const Test = trait({ x: 0, y: 0 });

    expect(Object.keys(Test)).toContain('schema');
    expect(typeof Test === 'function').toBe(true);
  });

  it('should throw an error if the schema contains an object', () => {
    // @ts-expect-error - we want to test the error case
    expect(() => trait({ object: { a: 1, b: 2 } })).toThrow();
  });

  it('should add and remove traits to an entity', () => {
    const entity = world.spawn();

    entity.add(Position);
    entity.add(Test);
    expect(entity.has(Position)).toBe(true);
    expect(entity.has(Test)).toBe(true);

    entity.remove(Position);
    expect(entity.has(Position)).toBe(false);
    expect(entity.has(Test)).toBe(true);

    // Add multiple traits at once.
    entity.add(Position, Test);
    expect(entity.has(Position)).toBe(true);
    expect(entity.has(Test)).toBe(true);

    // Remove multiple traits at once.
    entity.remove(Position, Test);
    expect(entity.has(Position)).toBe(false);
    expect(entity.has(Test)).toBe(false);

    // Can still remove multiple traits when one is missing.
    entity.add(Position, Test);
    entity.remove(Tag, Position, Test);

    expect(entity.has(Position)).toBe(false);
    expect(entity.has(Test)).toBe(false);
    expect(entity.has(Tag)).toBe(false);
  });

  it('should throw when setting a trait the entity does not have', () => {
    const entity = world.spawn(Position);
    expect(() => entity.set(Test, { current: 2 })).toThrow(/Add the trait/);

    entity.add(Test);
    entity.set(Test, { current: 2 });
    expect(entity.get(Test)?.current).toBe(2);
  });

  it('rejects setting an absent or removed trait before invoking its callback', () => {
    const sibling = world.spawn(Position({ x: 5 }));
    const entity = world.spawn();
    const update = vi.fn(() => ({ x: 10 }));

    expect(() => entity.set(Position, update)).toThrow(/Add the trait/);
    entity.add(Position);
    entity.set(Position, { x: 1 });
    entity.remove(Position);
    expect(() => entity.set(Position, update)).toThrow(/Add the trait/);

    expect(update).not.toHaveBeenCalled();
    expect(entity.has(Position)).toBe(false);
    expect(sibling.get(Position)).toEqual({ x: 5, y: 0 });
  });

  it('should create SoA stores when registered by adding', () => {
    const entity = world.spawn();

    entity.add(Position);
    const store = getStore(world, Position);

    expect(store.x).toBeDefined();
    expect(store.y).toBeDefined();
    const eid = entity & 0xfffff;
    expect(store.x[eid >>> 10][eid & 1023]).toBe(0);
    expect(store.y[eid >>> 10][eid & 1023]).toBe(0);
  });

  it('should set defaults based on the schema', () => {
    const entity = world.spawn();

    entity.add(Test);
    const test = entity.get(Test);

    expect(test).toMatchObject({
      current: 1,
      test: 'hello',
      bool: true,
      arr: ['a', 'b', 'c'],
    });
  });

  it('should override defaults with params', () => {
    const entity = world.spawn();

    // Partial
    entity.add(Test({ current: 2, arr: ['d', 'e', 'f'] }));
    let test = entity.get(Test);

    expect(test).toMatchObject({
      current: 2,
      test: 'hello',
      bool: true,
      arr: ['d', 'e', 'f'],
      class: new TestClass(),
    });

    // Reset
    entity.remove(Test);

    // Full
    entity.add(
      Test({
        current: 3,
        test: 'world',
        bool: false,
        arr: ['g', 'h', 'i'],
        class: new TestClass('Me'),
      })
    );

    test = entity.get(Test);
    expect(test).toMatchObject({
      current: 3,
      test: 'world',
      bool: false,
      arr: ['g', 'h', 'i'],
      class: new TestClass('Me'),
    });
  });

  it('should create tags with empty stores', () => {
    const IsTag = trait();
    const entity = world.spawn();

    entity.add(IsTag);
    expect(entity.has(IsTag)).toBe(true);

    const store = getStore(world, IsTag);
    expect(store).toMatchObject({});
  });

  // This tests for the trait bitmask limit of 32.
  it('should correctly register more than 32 traits', () => {
    const entity = world.spawn();

    Array.from({ length: 1024 }, () => trait()).forEach(() => {
      entity.add();
    });
  });

  it('should add traits to entities after recycling', () => {
    const entities: Entity[] = [];

    for (let i = 0; i < 10; i++) {
      entities.push(world.spawn());
    }

    for (let i = 0; i < 10; i++) {
      entities.pop()?.destroy();
    }

    for (let i = 0; i < 10; i++) {
      entities.push(world.spawn());
    }

    entities[0].add(Position);
    expect(entities[0].has(Position)).toBe(true);
  });

  it('should set trait params', () => {
    const entity = world.spawn(Test);
    entity.set(Test, { current: 2, test: 'world' });

    const test = entity.get(Test);
    expect(test).toMatchObject({
      current: 2,
      test: 'world',
      bool: true,
      arr: ['a', 'b', 'c'],
    });
  });

  it('trait props with callbacks should be called on each add', () => {
    const mock = vi.fn(() => new TestClass());
    const Test = trait({ value: mock });

    const entityA = world.spawn(Test);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(entityA.get(Test)!.value).toBeInstanceOf(TestClass);

    const entityB = world.spawn(Test);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(entityB.get(Test)!.value).toBeInstanceOf(TestClass);
  });

  it('can create atomic traits', () => {
    const object = { a: 1, b: 2 };
    const AtomicObject = trait(() => object);
    let entity = world.spawn(AtomicObject);

    // The object is returned by reference.
    expect(object).toBe(entity.get(AtomicObject));
    expect(entity.get(AtomicObject)!.a).toBe(1);

    entity.set(AtomicObject, { a: 2, b: 3 });

    // A new object is set making the reference different.
    expect(object).not.toBe(entity.get(AtomicObject));
    expect(entity.get(AtomicObject)!.a).toBe(2);

    // Can pass in a custom object into the trait.
    entity = world.spawn(AtomicObject({ a: 3, b: 4 }));
    expect(entity.get(AtomicObject)!.a).toBe(3);
    // Works with arrays too.
    const AtomicArray = trait(() => [1, 2, 3]);
    entity = world.spawn(AtomicArray);
    expect(entity.get(AtomicArray)).toEqual([1, 2, 3]);

    entity.set(AtomicArray, [4, 5, 6]);
    expect(entity.get(AtomicArray)).toEqual([4, 5, 6]);
  });

  it('should return undefined for tag traits', () => {
    const IsTag = trait();
    const entity = world.spawn();

    entity.add(IsTag);
    expect(entity.has(IsTag)).toBe(true);

    // Getting a tag trait should not throw
    expect(entity.get(IsTag)).toBeUndefined();
  });

  describe('tuples', () => {
    it('stores tuples by value', () => {
      const scale: Vec3 = [1, 1, 1];
      const Transform = trait({ position: [0, 0, 0], rotation: [0, 0, 0, 1], scale, mass: 1 });
      const a = world.spawn(Transform({ position: [1, 2, 3] }));
      const b = world.spawn(Transform);

      const transform = a.get(Transform)!;
      expectTypeOf(transform.position).toEqualTypeOf<[number, number, number]>();
      expectTypeOf(transform.scale).toEqualTypeOf<Vec3>();
      expectTypeOf(trait({ value: [0, 0] as const }).schema.value).toEqualTypeOf<[number, number]>();
      expect(transform).toEqual({
        position: [1, 2, 3],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        mass: 1,
      });

      // Neither the snapshot nor the value passed to set aliases storage.
      transform.position[0] = 100;
      const next: Vec3 = [4, 5, 6];
      a.set(Transform, { position: next });
      next[0] = 100;
      expect(a.get(Transform)!.position).toEqual([4, 5, 6]);

      expect(b.get(Transform)!.position).toEqual([0, 0, 0]);
      expect(b.get(Transform)!.scale).not.toBe(scale);
    });

    it('writes tuples mutated in updateEach back and detects changes per component', () => {
      const Position = trait({ value: [0, 0, 0] });
      const Velocity = trait({ value: [0, 0, 0] });
      const Changed = createChanged();
      const changed = vi.fn();
      world.onChange(Position, changed);
      world.query(Changed(Position));
      const moving = world.spawn(Position, Velocity({ value: [0, 2, 0] }));
      world.spawn(Position, Velocity);

      world.query(Position, Velocity).updateEach(([position, velocity]) => {
        for (let i = 0; i < 3; i++) position.value[i] += velocity.value[i];
      });

      expect(moving.get(Position)!.value).toEqual([0, 2, 0]);
      expect(changed.mock.calls).toEqual([[moving]]);
      expect([...world.query(Changed(Position))]).toEqual([moving]);
    });

    it('exposes interleaved columns through pages', () => {
      const Position = trait({ value: [0, 0, 0], mass: 1 });
      const entities = Array.from({ length: 1500 }, (_, i) =>
        i % 2 === 0 ? world.spawn(Position({ value: [i, i, i] })) : world.spawn()
      ).filter((entity) => entity.has(Position));

      const pages = world.query(Position).getPages();
      expectTypeOf(pages[0].stores).toEqualTypeOf<[{ value: number[]; mass: number[] }]>();

      for (const {
        stores: [position],
        indices,
      } of pages) {
        // Every slot is filled with the default, so a column holds 1024 tuples.
        expect(position.value).toHaveLength(1024 * 3);
        for (let i = 0; i < indices.length; i++) {
          const o = indices[i] * 3;
          position.value[o + 1] += position.mass[indices[i]];
        }
      }

      expect(pages.length).toBeGreaterThan(1);
      expect(entities.map((entity) => entity.get(Position)!.value[1])).toEqual(
        entities.map((_, i) => i * 2 + 1)
      );
    });

    it('copies tuples in relation data', () => {
      const Attached = relation({ store: { offset: [0, 0, 0] } });
      const parent = world.spawn();
      const child = world.spawn(Attached(parent));
      const offset: Vec3 = [1, 2, 3];

      expect(child.get(Attached(parent))!.offset).toEqual([0, 0, 0]);

      child.set(Attached(parent), { offset });
      offset[0] = 100;
      child.get(Attached(parent))!.offset[1] = 100;
      expect(child.get(Attached(parent))!.offset).toEqual([1, 2, 3]);
    });

    it('stores tuples that mix numbers with other values and warns about their cost', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const euler: [x: number, y: number, z: number, order?: 'xyz' | 'zyx'] = [0, 0, 0, 'xyz'];
      const Rotation = trait({ value: euler, flags: [true, false] });
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0][0]).toMatch(/value is a tuple that mixes numbers/);
      warn.mockRestore();

      const entity = world.spawn(Rotation({ value: [1, 2, 3, 'zyx'] }));
      const rotation = entity.get(Rotation)!;
      expectTypeOf(rotation.value).toEqualTypeOf(euler);
      expectTypeOf(rotation.flags).toEqualTypeOf<[boolean, boolean]>();
      expect(rotation).toEqual({ value: [1, 2, 3, 'zyx'], flags: [true, false] });
    });

    it('preserves declared element types in tuples with booleans', () => {
      type Value = [value: number, mode: 'local' | 'world', enabled: boolean];
      const value: Value = [0, 'local', true];
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const State = trait({ value });
      warn.mockRestore();

      const entity = world.spawn(State);
      expectTypeOf(entity.get(State)!.value).toEqualTypeOf<Value>();

      entity.set(State, (previous) => {
        expectTypeOf(previous.value).toEqualTypeOf<Value>();
        return { value: [previous.value[0] + 1, 'world', false] satisfies Value };
      });

      expect(entity.get(State)!.value).toEqual([1, 'world', false]);
    });

    it('rejects arrays that are not tuples', () => {
      // @ts-expect-error - a tuple needs a fixed stride
      expect(() => trait({ value: [] })).toThrow(/not a valid tuple/);
      // @ts-expect-error - tuples cannot nest
      expect(() => trait({ value: [[0, 0]] })).toThrow(/not a valid tuple/);
      // @ts-expect-error - tuples cannot hold objects
      expect(() => trait({ value: [0, { order: 'xyz' }] })).toThrow(/not a valid tuple/);
    });
  });
});
