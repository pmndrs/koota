import { useTrait, useTraitEffect } from '../src';
import { createWorld, ordered, relation, trait, type Entity, type TraitRecord } from '@koota/core';
import { render } from '@testing-library/svelte';
import { ComponentProps, flushSync, tick } from 'svelte';
import { fromStore, writable } from 'svelte/store';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import HookConsumer from './components/hook-consumer.svelte';
import TraitEffectTest from './components/TraitEffectTest.svelte';
import TraitTest from './components/TraitTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Position = trait({ x: 0, y: 0 });

it('infers records from direct traits and getters', () => {
  const target = (): Entity | undefined => undefined;
  expectTypeOf(() => useTrait(target, Position).current).returns.toEqualTypeOf<
    { x: number; y: number } | undefined
  >();
  expectTypeOf(() => useTrait(target, () => Position).current).returns.toEqualTypeOf<
    { x: number; y: number } | undefined
  >();
  expectTypeOf(() =>
    useTraitEffect(
      () => createWorld(),
      Position,
      (value) => {
        expectTypeOf(value).toEqualTypeOf<{ x: number; y: number } | undefined>();
      }
    )
  ).toBeFunction();
});

describe('useTrait', () => {
  let world = createWorld();

  const renderSubject = (props: any) => {
    return render(TraitTest, {
      context: new Map([[WORLD_KEY, world]]),
      props,
    });
  };

  beforeEach(() => {
    world = createWorld();
  });

  it('keeps frozen ordered snapshots stable until membership or order changes', async () => {
    const ChildOf = relation(),
      Children = ordered(ChildOf);
    const parent = world.spawn(Children);
    const a = world.spawn(ChildOf(parent)),
      b = world.spawn();
    const selected = writable(parent);
    const target = fromStore(selected);
    let read!: () => readonly Entity[] | undefined;
    const { unmount } = render(HookConsumer, {
      context: new Map([[WORLD_KEY, world]]),
      props: {
        read: () => {
          const children = useTrait(() => target.current, Children);
          expectTypeOf(children.current).toEqualTypeOf<readonly Entity[] | undefined>();
          read = () => children.current;
        },
      },
    });
    await tick();
    const initial = read();
    b.add(ChildOf(parent));
    const added = read();
    parent.get(Children)!.moveTo(b, 0);
    const moved = read();
    expect(initial).toEqual([a]);
    expect(added).toEqual([a, b]);
    expect(moved).toEqual([b, a]);
    expect(Object.isFrozen(moved)).toBe(true);
    parent.changed(Children);
    expect(read()).toBe(moved);
    parent.remove(Children);
    expect(read()).toBeUndefined();
    const other = world.spawn(Children);
    b.add(ChildOf(other));
    selected.set(other);
    expect(read()).toEqual([b]);
    unmount();
  });

  it('reactively returns the trait value for an entity', async () => {
    const entity = world.spawn(Position);

    const { getByTestId } = renderSubject({
      target: entity,
      trait: Position,
    });

    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

    entity.set(Position, { x: 1, y: 1 });
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));
  });

  it('returns the initial value synchronously', () => {
    const entity = world.spawn(Position({ x: 1, y: 2 }));
    let initialValue: unknown;

    renderSubject({
      target: entity,
      trait: Position,
      onInitial: (value: unknown) => {
        initialValue = value;
      },
    });

    expect(initialValue).toEqual({ x: 1, y: 2 });
  });

  it('works with a world', async () => {
    const TimeOfDay = trait({ hour: 0 });
    world.add(TimeOfDay);

    const { getByTestId } = renderSubject({
      target: world,
      trait: TimeOfDay,
    });

    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ hour: 0 }));

    world.set(TimeOfDay, { hour: 1 });
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ hour: 1 }));
  });

  it('handles an unregistered world', async () => {
    const { getByTestId } = renderSubject({
      target: world,
      trait: Position,
    });

    await tick();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('returns undefined when the target is undefined', async () => {
    const { getByTestId } = renderSubject({
      target: undefined,
      trait: Position,
    });

    await tick();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('returns undefined when the target becomes undefined', async () => {
    let entity: Entity | undefined = world.spawn(Position);

    const { getByTestId, rerender } = renderSubject({
      target: entity,
      trait: Position,
    });

    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

    entity = undefined;
    await rerender({ target: undefined, trait: Position });
    await tick();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('reactively updates when the world is reset', async () => {
    const entity = world.spawn(Position);

    const { getByTestId } = renderSubject({
      target: entity,
      trait: Position,
    });

    await tick();
    entity.set(Position, { x: 1, y: 1 });
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));

    world.reset();
    await tick();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('re-renders when entity.changed() is called on an AoS trait', async () => {
    class Counter {
      value = 0;
      increment() {
        this.value++;
      }
    }
    const CounterTrait = trait(() => new Counter());
    const entity = world.spawn(CounterTrait);

    const { getByTestId } = renderSubject({
      target: entity,
      trait: CounterTrait,
    });

    await tick();
    const initial = getByTestId('value').textContent;

    entity.get(CounterTrait)?.increment();
    entity.changed(CounterTrait);
    await tick();

    const updated = getByTestId('value').textContent;
    expect(updated).not.toBe(initial);
  });

  it('immediately reflects the new entity value when switching entities', async () => {
    const entityA = world.spawn(Position({ x: 1, y: 1 }));
    const entityB = world.spawn(Position({ x: 99, y: 99 }));

    const { getByTestId, rerender } = renderSubject({
      target: entityA,
      trait: Position,
    });

    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));

    await rerender({ target: entityB, trait: Position });
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 99, y: 99 }));
  });

  it('reactively returns relation pair store data', async () => {
    const ChildOf = relation({ store: { order: 0 } });
    const parentA = world.spawn();
    const parentB = world.spawn();
    const child = world.spawn();

    const { getByTestId } = renderSubject({
      target: child,
      trait: ChildOf(parentA),
    });

    await tick();
    expect(getByTestId('value').textContent).toBe('undefined');

    child.add(ChildOf(parentB, { order: 10 }));
    await tick();
    expect(getByTestId('value').textContent).toBe('undefined');

    child.add(ChildOf(parentA, { order: 1 }));
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 1 }));

    child.set(ChildOf(parentA), { order: 2 });
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 2 }));

    child.remove(ChildOf(parentA));
    await tick();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('accepts a direct trait value', async () => {
    const entity = world.spawn(Position);

    const { getByTestId } = renderSubject({
      target: entity,
      trait: Position,
    });

    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

    entity.set(Position, { x: 5, y: 5 });
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 5, y: 5 }));
  });

  it('reacts to relation pair target changes via getter', async () => {
    const ChildOf = relation({ store: { order: 0 } });
    const parentA = world.spawn();
    const parentB = world.spawn();
    const child = world.spawn();
    child.add(ChildOf(parentA, { order: 1 }));
    child.add(ChildOf(parentB, { order: 2 }));

    const { getByTestId, rerender } = renderSubject({
      target: child,
      trait: ChildOf(parentA),
    });

    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 1 }));

    // Switch the observed relation pair from parentA to parentB
    await rerender({ target: child, trait: ChildOf(parentB) });
    await tick();
    expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 2 }));
  });
});

describe('useTraitEffect', () => {
  let world = createWorld();

  const renderSubject = (props: ComponentProps<typeof TraitEffectTest>) => {
    return render(TraitEffectTest, {
      context: new Map([[WORLD_KEY, world]]),
      props,
    });
  };

  beforeEach(() => {
    world = createWorld();
  });

  it('reactively calls callback when trait value changes', async () => {
    let entity = world.spawn(Position);
    let position: TraitRecord<typeof Position> | undefined;

    renderSubject({
      target: entity,
      trait: Position,
      callback: (value: TraitRecord<typeof Position> | undefined) => {
        position = value;
      },
    });

    await tick();
    expect(position).toEqual({ x: 0, y: 0 });

    entity.set(Position, { x: 1, y: 1 });
    await tick();
    expect(position).toEqual({ x: 1, y: 1 });
  });

  it('does not track state read by the callback', async () => {
    const entity = world.spawn(Position);
    let calls = 0;
    const { getByTestId } = renderSubject({
      target: entity,
      trait: Position,
      callback: () => calls++,
    });

    await tick();
    expect(calls).toBe(1);

    getByTestId('dependency').click();
    await tick();
    expect(calls).toBe(1);
  });

  it('calls callback with undefined when trait is removed', async () => {
    let entity = world.spawn(Position);
    let position: TraitRecord<typeof Position> | undefined;

    renderSubject({
      target: entity,
      trait: Position,
      callback: (value: TraitRecord<typeof Position> | undefined) => {
        position = value;
      },
    });

    await tick();
    expect(position).toEqual({ x: 0, y: 0 });

    entity.remove(Position);
    await tick();
    expect(position).toBeUndefined();
  });

  it.each(['register', 'reset'] as const)(
    'can %s the world in the initial trait effect',
    (action) => {
      const Progress = trait({ value: 0 });
      if (action === 'reset') world.add(Progress);
      const seen: (number | undefined)[] = [];
      const callback = (progress: { value: number } | undefined) => {
        seen.push(progress?.value);
        if (seen.length === 1) {
          if (action === 'reset') world.reset();
          else world.add(Progress);
        }
      };
      const { unmount } = renderSubject({ target: world, trait: Progress, callback });
      flushSync();
      const initial = action === 'reset' ? [0, undefined] : [undefined, undefined, 0];
      expect(seen).toEqual(initial);
      world.reset();
      world.add(Progress({ value: 1 }));
      world.set(Progress, { value: 2 });
      world.destroy();
      expect(world.isRegistered).toBe(false);
      world.add(Progress({ value: 3 }));
      unmount();
      world.set(Progress, { value: 4 });
      world.reset();
      world.add(Progress({ value: 5 }));
      expect(seen).toEqual([...initial, undefined, 1, 2, undefined, undefined, 3]);
      world.destroy();
    }
  );

  it('supports relation pair subscriptions', async () => {
    const ChildOf = relation({ store: { order: 0 } });
    const parentA = world.spawn();
    const parentB = world.spawn();
    const child = world.spawn();
    const updates: Array<{ order: number } | undefined> = [];

    renderSubject({
      target: child,
      trait: ChildOf(parentA),
      callback: (value: { order: number } | undefined) => {
        updates.push(value);
      },
    });

    await tick();
    expect(updates.at(-1)).toBeUndefined();

    child.add(ChildOf(parentB, { order: 10 }));
    await tick();
    expect(updates.at(-1)).toBeUndefined();

    child.add(ChildOf(parentA, { order: 1 }));
    await tick();
    expect(updates.at(-1)).toEqual({ order: 1 });

    child.set(ChildOf(parentA), { order: 2 });
    await tick();
    expect(updates.at(-1)).toEqual({ order: 2 });

    child.remove(ChildOf(parentA));
    await tick();
    expect(updates.at(-1)).toBeUndefined();
  });
});
