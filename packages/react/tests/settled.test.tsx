import { createQuery, createWorld, relation, trait } from '@koota/core';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  useHas,
  useQuery,
  useQueryFirst,
  useTarget,
  useTargets,
  useTrait,
  useTraitEffect,
} from '../src';
import { withWorld } from './with-world';

it('refreshes all entity and query hooks after removal side effects synchronously', () => {
  const world = createWorld({ retain: 0 });
  const Value = trait({ x: 1 });
  const Link = relation();
  const ChildOf = relation({ autoDestroy: 'source' });
  const parent = world.spawn();
  const child = world.spawn(ChildOf(parent));
  const a = world.spawn();
  const b = world.spawn();
  const source = world.spawn(Value, Link(a));
  const effects: unknown[] = [];
  const { result, unmount } = renderHook(
    () => {
      const has = useHas(source, Link('*'));
      const target = useTarget(source, Link);
      const targets = useTargets(source, Link);
      const value = useTrait(source, Value);
      const query = useQuery(ChildOf('*'));
      const first = useQueryFirst(ChildOf('*'));
      useTraitEffect(source, Value, (value) => {
        effects.push([
          value,
          world.isAlive(parent),
          world.isAlive(child),
          world.targetsFor(source, Link),
        ]);
      });
      return { has, target, targets, value, query, first };
    },
    { wrapper: withWorld(world) }
  );
  world.onRemove(source, Value, () => {
    world.destroy(parent);
    world.remove(source, Link(a));
  });
  world.onRemove(source, Link, () => world.add(source, Link(b)));
  effects.length = 0;
  act(() => {
    world.remove(source, Value);
    expect(effects).toEqual([[undefined, false, false, [b]]]);
  });
  expect(result.current).toEqual({
    has: true,
    target: b,
    targets: [b],
    value: undefined,
    query: [],
    first: undefined,
  });
  unmount();
});

it('coalesces writes inside structural callbacks and still delivers ordinary writes immediately', () => {
  const world = createWorld();
  const Value = trait({ x: 0 });
  const Trigger = trait();
  const source = world.spawn(Value, Trigger);
  const values: unknown[] = [];
  const { unmount } = renderHook(() => useTraitEffect(source, Value, (v) => values.push(v?.x)), {
    wrapper: withWorld(world),
  });
  world.onRemove(source, Trigger, () => {
    world.set(source, Value, { x: 1 });
    world.set(source, Value, { x: 2 });
  });
  values.length = 0;
  world.remove(source, Trigger);
  expect(values).toEqual([2]);
  world.set(source, Value, { x: 3 });
  expect(values).toEqual([2, 3]);
  unmount();
});

it('clears every hook when the source is destroyed and when the world resets', () => {
  const world = createWorld();
  const Value = trait({ x: 1 });
  const Link = relation();
  const source = world.spawn(Value, Link(world.spawn()));
  const other = world.spawn(Value);
  const { result } = renderHook(
    () => ({
      has: useHas(source, Link('*')),
      target: useTarget(source, Link),
      targets: useTargets(source, Link),
      value: useTrait(source, Value),
      query: useQuery(Value),
    }),
    { wrapper: withWorld(world) }
  );
  act(() => world.destroy(source));
  expect(result.current).toEqual({
    has: false,
    target: undefined,
    targets: [],
    value: undefined,
    query: [other],
  });
  act(() => world.reset());
  expect(result.current.query).toEqual([]);
});

it('updates filtered relation presence when an existing target enters or leaves the filter', () => {
  const world = createWorld(),
    Enabled = trait(),
    Link = relation();
  const target = world.spawn(),
    source = world.spawn(Link(target));
  const filter = createQuery(Enabled);
  world.add(Link(target));
  const { result, unmount } = renderHook(
    () => [useHas(source, Link(Enabled)), useHas(source, Link(filter)), useHas(world, Link(Enabled))],
    { wrapper: withWorld(world) }
  );
  expect(result.current).toEqual([false, false, false]);
  act(() => world.add(target, Enabled));
  expect(result.current).toEqual([true, true, true]);
  act(() => world.remove(target, Enabled));
  expect(result.current).toEqual([false, false, false]);
  unmount();
  world.destroy();
});
