import { createWorld, machine, trait, type Entity } from '@koota/core';
import { cleanup, renderHook } from '@testing-library/react';
import { act, useLayoutEffect } from 'react';
import { afterEach, expect, expectTypeOf, it } from 'vitest';
import { useMachine, useTraitEffect } from '../src';
import { withWorld } from './with-world';

afterEach(cleanup);

it('observes entry, re-entry, removal, destruction and target changes', () => {
  const Idle = trait(),
    Loading = trait({ requestId: 0 });
  const Download = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  const first = world.spawn(),
    second = world.spawn(Download);
  const { result, rerender, unmount } = renderHook(
    ({ target }: { target: Entity | null }) => {
      const state = useMachine(target, Download);
      return { state, requestId: state === Loading ? target?.get(Loading)?.requestId : undefined };
    },
    {
      initialProps: { target: first as Entity | null },
      wrapper: withWorld(world),
      reactStrictMode: true,
    }
  );
  expectTypeOf(result.current.state).toEqualTypeOf<typeof Idle | typeof Loading | undefined>();
  expect(result.current.state).toBeUndefined();
  act(() => first.add(Download));
  expect(result.current.state).toBe(Idle);
  act(() => Download.enter(first, Loading));
  expect(result.current).toEqual({ state: Loading, requestId: 0 });
  act(() => Download.enter(first, Loading({ requestId: 2 })));
  expect(result.current).toEqual({ state: Loading, requestId: 2 });
  act(() => first.remove(Download));
  expect(result.current.state).toBeUndefined();
  rerender({ target: second });
  expect(result.current.state).toBe(Idle);
  act(() => second.destroy());
  expect(result.current.state).toBeUndefined();
  rerender({ target: null });
  expect(result.current.state).toBeUndefined();
  unmount();
  world.destroy();
});

it('catches transitions before subscribing and follows a world through reset', () => {
  const Idle = trait(),
    Loading = trait();
  const Download = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  world.add(Download);
  const { result, unmount } = renderHook(
    () => {
      useLayoutEffect(() => {
        world.add(Loading);
      }, []);
      return useMachine(world, Download);
    },
    { wrapper: withWorld(world) }
  );
  expect(result.current).toBe(Loading);
  act(() => world.reset());
  expect(result.current).toBeUndefined();
  act(() => world.add(Download));
  expect(result.current).toBe(Idle);
  unmount();
  world.destroy();
});

it('catches a round trip to the same state before subscribing', () => {
  const Active = trait({ value: 1 });
  const Idle = trait();
  const State = machine({ states: { Active, Idle }, initial: Active });
  const world = createWorld();
  const entity = world.spawn(State);
  const { result, unmount } = renderHook(
    () => {
      useMachine(entity, State);
      useLayoutEffect(() => {
        State.enter(entity, Idle);
        State.enter(entity, Active({ value: 2 }));
      }, []);
      return entity.get(Active)?.value;
    },
    { wrapper: withWorld(world) }
  );
  expect(result.current).toBe(2);
  unmount();
  world.destroy();
});

it('runs trait effects once after re-entry and state changes', () => {
  const Loading = trait({ progress: 0 });
  const Loaded = trait();
  const AssetMachine = machine({ states: { Loading, Loaded }, initial: Loading });
  const world = createWorld();
  const entity = world.spawn(AssetMachine);
  const observations: unknown[] = [];
  const { unmount } = renderHook(
    () =>
      useTraitEffect(entity, Loading, (value) => {
        observations.push([
          value,
          AssetMachine.current(entity),
          entity.has(Loading),
          world.query(Loaded).toArray(),
        ]);
      }),
    { wrapper: withWorld(world) }
  );
  observations.length = 0;

  act(() => AssetMachine.enter(entity, Loading({ progress: 0.5 })));
  expect(observations).toEqual([[{ progress: 0.5 }, Loading, true, []]]);
  observations.length = 0;

  act(() => AssetMachine.enter(entity, Loaded));
  expect(observations).toEqual([[undefined, Loaded, false, [entity]]]);
  unmount();
  world.destroy();
});

it('keeps a world trait effect subscribed across reset', () => {
  const world = createWorld();
  const Progress = trait({ value: 0 });
  world.add(Progress);
  const seen: (number | undefined)[] = [];
  const { unmount } = renderHook(
    () => useTraitEffect(world, Progress, (value) => seen.push(value?.value)),
    { wrapper: withWorld(world) }
  );
  act(() => world.reset());
  act(() => world.add(Progress({ value: 2 })));
  expect(seen).toEqual([0, undefined, 2]);
  unmount();
  world.destroy();
});
