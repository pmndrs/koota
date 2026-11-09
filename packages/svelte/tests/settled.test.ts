import { createWorld, relation, trait } from '@koota/core';
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
          world.isAlive(parent),
          world.isAlive(child),
          world.isAlive(source) ? world.targetsFor(source, Link) : [],
        ]),
    },
  });
  flushSync();
  world.onRemove(source, Value, () => {
    world.destroy(parent);
    world.remove(source, Link(a));
  });
  const off = world.onRemove(source, Link, () => world.add(source, Link(b)));
  effects.length = 0;
  world.remove(source, Value);
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
  world.destroy(source);
  expect(read()).toEqual({
    has: false,
    target: undefined,
    targets: [],
    value: undefined,
    query: [],
    first: undefined,
  });
  flushSync(() => unmount());
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
  world.onRemove(source, Trigger, () => {
    world.set(source, Value, { x: 1 });
    world.set(source, Value, { x: 2 });
  });
  values.length = 0;
  world.remove(source, Trigger);
  expect(values).toEqual([{ x: 2 }]);
  world.set(source, Value, { x: 3 });
  expect(values).toEqual([{ x: 2 }, { x: 3 }]);
  flushSync(() => unmount());
});

it('clears every hook when the world resets', () => {
  const world = createWorld();
  const Value = trait({ x: 1 });
  const Link = relation();
  const source = world.spawn(Value, Link(world.spawn()));
  let read!: () => unknown;
  render(SettledTest, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      source,
      valueTrait: Value,
      relation: Link,
      childOf: Link,
      expose: (fn: () => unknown) => {
        read = fn;
      },
      onValue: () => {},
    },
  });
  flushSync();
  expect(read()).toMatchObject({ has: true, query: [source] });
  world.reset();
  expect(read()).toEqual({
    has: false,
    target: undefined,
    targets: [],
    value: undefined,
    query: [],
    first: undefined,
  });
});
