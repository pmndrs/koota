import { $internal, createWorld, relation, trait } from '@koota/core';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { expect, it } from 'vitest';
import SettledTest from './components/settled-test.svelte';
import { WORLD_KEY } from '../src/world/world-context';

it('refreshes every hook synchronously after removal and child destruction', () => {
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
  let read!: () => unknown;
  const { unmount } = render(SettledTest, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      source,
      valueTrait: Value,
      relation: Link,
      childOf: ChildOf,
      expose: (fn: () => unknown) => {
        read = fn;
      },
      onValue: (value: unknown) =>
        effects.push([
          value,
          parent.isAlive(),
          child.isAlive(),
          source.isAlive() ? source.targetsFor(Link) : [],
        ]),
    },
  });
  flushSync();
  source.onRemove(Value, () => {
    parent.destroy();
    source.remove(Link(a));
  });
  const off = source.onRemove(Link, () => source.add(Link(b)));
  effects.length = 0;
  source.remove(Value);
  expect(effects).toEqual([[undefined, false, false, [b]]]);
  expect(read()).toEqual({
    has: true,
    target: b,
    targets: [b],
    value: undefined,
    query: [],
    first: undefined,
  });
  off();
  source.destroy();
  expect(read()).toEqual({
    has: false,
    target: undefined,
    targets: [],
    value: undefined,
    query: [],
    first: undefined,
  });
  flushSync(() => unmount());
  expect(world[$internal].settledSubscriptions.size).toBe(0);
});

it('coalesces structural callback writes and preserves immediate ordinary writes', () => {
  const world = createWorld();
  const Value = trait({ x: 0 });
  const Trigger = trait();
  const Link = relation();
  const source = world.spawn(Value, Trigger);
  const values: unknown[] = [];
  const { unmount } = render(SettledTest, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      source,
      valueTrait: Value,
      relation: Link,
      childOf: Link,
      expose: () => {},
      onValue: (value: unknown) => values.push(value),
    },
  });
  flushSync();
  source.onRemove(Trigger, () => {
    source.set(Value, { x: 1 });
    source.set(Value, { x: 2 });
  });
  values.length = 0;
  source.remove(Trigger);
  expect(values).toEqual([{ x: 2 }]);
  source.set(Value, { x: 3 });
  expect(values).toEqual([{ x: 2 }, { x: 3 }]);
  flushSync(() => unmount());
  expect(world[$internal].settledSubscriptions.size).toBe(0);
});
