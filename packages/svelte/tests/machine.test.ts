import { createWorld, machine, trait, type Trait } from '@koota/core';
import { cleanup, render } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { afterEach, expect, it } from 'vitest';
import MachineTest from './components/machine-test.svelte';

afterEach(cleanup);

it('observes entry, self-transitions, removal and destruction', () => {
  const Idle = trait();
  const Loading = trait({ progress: 0 });
  const Asset = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  const entity = world.spawn();
  let result!: { readonly current: Trait | undefined };
  const { getByTestId, unmount } = render(MachineTest, {
    props: {
      target: entity,
      machine: Asset,
      direct: true,
      onInitial: (value: { readonly current: Trait | undefined }) => {
        result = value;
      },
      data: (state: Trait | undefined) => (state === Loading ? entity.get(Loading) : undefined),
    },
  });
  flushSync();
  expect(result.current).toBeUndefined();
  entity.add(Asset);
  expect(result.current).toBe(Idle);
  Asset.enter(entity, Loading({ progress: 0.5 }));
  expect(result.current).toBe(Loading);
  flushSync();
  expect(getByTestId('data').textContent).toBe('{"progress":0.5}');

  Asset.enter(entity, Loading({ progress: 1 }));
  flushSync();
  expect(getByTestId('data').textContent).toBe('{"progress":1}');
  entity.remove(Asset);
  expect(result.current).toBeUndefined();
  entity.add(Asset);
  entity.destroy();
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
  first.remove(Asset);
  expect(result.current).toBe(Loading);
  await rerender({ machine: Activity });
  expect(result.current).toBe(Active);
  Asset.enter(second, Idle);
  expect(result.current).toBe(Active);
  await rerender({ target: null });
  expect(result.current).toBeUndefined();
  Activity.enter(second, Inactive);
  expect(result.current).toBeUndefined();
  await rerender({ target: second });
  expect(result.current).toBe(Inactive);
  flushSync(() => unmount());
  Activity.enter(second, Active);
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
    props: {
      target: entity,
      machine: Asset,
      onInitial: (result: { readonly current: Trait | undefined }) => {
        expect(result.current).toBe(Loading);
      },
      beforeEffects: () => {
        Asset.enter(entity, Loading({ progress: 1 }));
      },
      data: (state: Trait | undefined) => (state === Loading ? entity.get(Loading) : undefined),
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
    if (beforeRender) entity.destroy();
    const { getByTestId, unmount } = render(MachineTest, {
      props: {
        target: entity,
        machine: Asset,
        onInitial: () => {
          if (!beforeRender) entity.destroy();
        },
      },
    });
    await tick();
    expect(getByTestId('state').textContent).toBe('undefined');
    flushSync(() => unmount());
    world.destroy();
  }
);
