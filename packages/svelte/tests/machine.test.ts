import { createWorld, machine, trait, type Trait } from '@koota/core';
import { cleanup, render } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { afterEach, expect, it } from 'vitest';
import MachineTest from './components/machine-test.svelte';
import { WORLD_KEY } from '../src/world/world-context';

afterEach(cleanup);

it('observes entry, self-transitions, removal and destruction', () => {
  const Idle = trait();
  const Loading = trait({ progress: 0 });
  const Asset = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  const entity = world.spawn();
  let result!: { readonly current: Trait | undefined };
  const { getByTestId, unmount } = render(MachineTest, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      target: entity,
      machine: Asset,
      direct: true,
      onInitial: (value: { readonly current: Trait | undefined }) => {
        result = value;
      },
      data: (state: Trait | undefined) =>
        state === Loading ? world.get(entity, Loading) : undefined,
    },
  });
  flushSync();
  expect(result.current).toBeUndefined();
  world.add(entity, Asset);
  expect(result.current).toBe(Idle);
  Asset.enter(world, entity, Loading({ progress: 0.5 }));
  expect(result.current).toBe(Loading);
  flushSync();
  expect(getByTestId('data').textContent).toBe('{"progress":0.5}');

  Asset.enter(world, entity, Loading({ progress: 1 }));
  flushSync();
  expect(getByTestId('data').textContent).toBe('{"progress":1}');
  world.remove(entity, Asset);
  expect(result.current).toBeUndefined();
  world.add(entity, Asset);
  world.destroy(entity);
  expect(result.current).toBeUndefined();
  flushSync(() => unmount());
  world.destroy();
});

it('switches targets and machines and unsubscribes on unmount', async () => {
  const Idle = trait();
  const Loading = trait();
  const Asset = machine({ states: { Idle, Loading }, initial: Idle });
  const Active = trait();
  const Inactive = trait();
  const Activity = machine({ states: { Active, Inactive }, initial: Active });
  const world = createWorld();
  const first = world.spawn(Asset);
  const second = world.spawn(Loading, Activity);
  let result!: { readonly current: Trait | undefined };
  const { rerender, unmount } = render(MachineTest, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      target: first,
      machine: Asset,
      onInitial: (value: { readonly current: Trait | undefined }) => {
        result = value;
      },
    },
  });
  flushSync();
  expect(result.current).toBe(Idle);
  await rerender({ target: second });
  expect(result.current).toBe(Loading);
  world.remove(first, Asset);
  expect(result.current).toBe(Loading);
  await rerender({ machine: Activity });
  expect(result.current).toBe(Active);
  Asset.enter(world, second, Idle);
  expect(result.current).toBe(Active);
  await rerender({ target: null });
  expect(result.current).toBeUndefined();
  Activity.enter(world, second, Inactive);
  expect(result.current).toBeUndefined();
  await rerender({ target: second });
  expect(result.current).toBe(Inactive);
  flushSync(() => unmount());
  Activity.enter(world, second, Active);
  expect(result.current).toBe(Inactive);
  world.destroy();
});

it('observes a lazy world singleton through reset and reattachment', () => {
  const Idle = trait();
  const Loading = trait();
  const Asset = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  let result!: { readonly current: Trait | undefined };
  const { unmount } = render(MachineTest, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      target: world,
      machine: Asset,
      onInitial: (value: { readonly current: Trait | undefined }) => {
        result = value;
      },
    },
  });
  flushSync();
  expect(result.current).toBeUndefined();
  world.reset();
  expect(result.current).toBeUndefined();
  world.add(Asset);
  expect(result.current).toBe(Idle);
  world.add(Loading);
  expect(result.current).toBe(Loading);
  world.reset();
  expect(result.current).toBeUndefined();
  world.add(Asset);
  expect(result.current).toBe(Idle);
  flushSync(() => unmount());
  world.destroy();
});

it('catches a self-transition between initialization and subscribing', async () => {
  const Loading = trait({ progress: 0 });
  const Asset = machine({ states: { Loading }, initial: Loading });
  const world = createWorld();
  const entity = world.spawn(Asset);
  const { getByTestId, unmount } = render(MachineTest, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      target: entity,
      machine: Asset,
      onInitial: (result: { readonly current: Trait | undefined }) => {
        expect(result.current).toBe(Loading);
      },
      beforeEffects: () => {
        Asset.enter(world, entity, Loading({ progress: 1 }));
      },
      data: (state: Trait | undefined) =>
        state === Loading ? world.get(entity, Loading) : undefined,
    },
  });
  await tick();
  expect(getByTestId('data').textContent).toBe('{"progress":1}');
  flushSync(() => unmount());
  world.destroy();
});

it.each([false, true])(
  'handles destruction before subscription (before render: %s)',
  async (beforeRender) => {
    const Idle = trait();
    const Asset = machine({ states: { Idle }, initial: Idle });
    const world = createWorld();
    const entity = world.spawn(Asset);
    if (beforeRender) world.destroy(entity);
    const { getByTestId, unmount } = render(MachineTest, {
      context: new Map([[WORLD_KEY, world]]),
      props: {
        target: entity,
        machine: Asset,
        onInitial: () => {
          if (!beforeRender) world.destroy(entity);
        },
      },
    });
    await tick();
    expect(getByTestId('state').textContent).toBe('undefined');
    flushSync(() => unmount());
    world.destroy();
  }
);
