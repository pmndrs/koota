import { createWorld, relation, trait } from '@koota/core';
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
  WorldProvider,
} from '../src';

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
        effects.push([value, parent.isAlive(), child.isAlive(), source.targetsFor(Link)]);
      });
      return { has, target, targets, value, query, first };
    },
    { wrapper: ({ children }) => <WorldProvider world={world}>{children}</WorldProvider> }
  );
  source.onRemove(Value, () => {
    parent.destroy();
    source.remove(Link(a));
  });
  source.onRemove(Link, () => source.add(Link(b)));
  effects.length = 0;
  act(() => {
    source.remove(Value);
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
  const { unmount } = renderHook(() => useTraitEffect(source, Value, (v) => values.push(v?.x)));
  source.onRemove(Trigger, () => {
    source.set(Value, { x: 1 });
    source.set(Value, { x: 2 });
  });
  values.length = 0;
  source.remove(Trigger);
  expect(values).toEqual([2]);
  source.set(Value, { x: 3 });
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
    { wrapper: ({ children }) => <WorldProvider world={world}>{children}</WorldProvider> }
  );
  act(() => source.destroy());
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
