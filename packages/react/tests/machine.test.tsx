import { createWorld, machine, trait, type Entity } from '@koota/core';
import { cleanup, renderHook } from '@testing-library/react';
import { act, StrictMode, useLayoutEffect } from 'react';
import { afterEach, expect, expectTypeOf, it } from 'vitest';
import { useMachine } from '../src';

afterEach(cleanup);

it('observes entry, re-entry, removal, destruction and target changes', () => {
  const Idle = trait(),
    Loading = trait({ requestId: 0 });
  const Download = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  const first = world.spawn(),
    second = world.spawn(Download);
  let renders = 0;
  const { result, rerender, unmount } = renderHook(
    ({ target }: { target: Entity | null }) => {
      renders++;
      return useMachine(target, Download);
    },
    { initialProps: { target: first as Entity | null }, wrapper: StrictMode }
  );
  expectTypeOf(result.current).toEqualTypeOf<typeof Idle | typeof Loading | undefined>();
  expect(result.current).toBeUndefined();
  act(() => first.add(Download));
  expect(result.current).toBe(Idle);
  act(() => Download.enter(first, Loading));
  expect(result.current).toBe(Loading);
  const before = renders;
  act(() => Download.enter(first, Loading({ requestId: 2 })));
  expect(renders).toBeGreaterThan(before);
  act(() => first.remove(Download));
  expect(result.current).toBeUndefined();
  rerender({ target: second });
  expect(result.current).toBe(Idle);
  act(() => second.destroy());
  expect(result.current).toBeUndefined();
  rerender({ target: null });
  expect(result.current).toBeUndefined();
  unmount();
  world.destroy();
});

it('catches transitions before subscribing and follows a world through reset', () => {
  const Idle = trait(),
    Loading = trait();
  const Download = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  world.add(Download);
  const { result, unmount } = renderHook(() => {
    useLayoutEffect(() => {
      world.add(Loading);
    }, []);
    return useMachine(world, Download);
  });
  expect(result.current).toBe(Loading);
  act(() => world.reset());
  expect(result.current).toBeUndefined();
  act(() => world.add(Download));
  expect(result.current).toBe(Idle);
  unmount();
  world.destroy();
});

it.each([false, true])(
  'catches transitions back to the same state before subscribing (via another state: %s)',
  (roundTrip) => {
    const Active = trait({ value: 1 });
    const Idle = trait();
    const State = machine({ states: { Active, Idle }, initial: Active });
    const world = createWorld();
    const entity = world.spawn(State);
    const { result, unmount } = renderHook(() => {
      useMachine(entity, State);
      useLayoutEffect(() => {
        if (roundTrip) State.enter(entity, Idle);
        State.enter(entity, Active({ value: 2 }));
      }, []);
      return entity.get(Active)?.value;
    });
    expect(entity.get(Active)?.value).toBe(2);
    expect(result.current).toBe(2);
    unmount();
    world.destroy();
  }
);
