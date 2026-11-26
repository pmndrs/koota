import { machine, relation, trait } from '@koota/core';
import { createWorld } from '@koota/core/src/isolated';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { expect, it } from 'vitest';
import { useHas, useMachine, useQuery, useTarget, useTrait } from '../src';
import { withWorld } from './with-world';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Position = trait({ x: 0, y: 0 });
const ChildOf = relation();
const Idle = trait();
const Busy = trait();
const Work = machine({ states: { Idle, Busy }, initial: Idle });

it('reads and follows entities of an isolated world', () => {
  const world = createWorld();
  const parent = world.spawn();
  const entity = world.spawn(Position({ x: 1 }), ChildOf(parent), Work);

  const { result } = renderHook(
    () => ({
      position: useTrait(entity, Position),
      has: useHas(entity, Position),
      parent: useTarget(entity, ChildOf),
      state: useMachine(entity, Work),
      matches: useQuery(Position),
    }),
    { wrapper: withWorld(world) }
  );

  expect(result.current).toEqual({
    position: { x: 1, y: 0 },
    has: true,
    parent,
    state: Idle,
    matches: [entity],
  });

  act(() => {
    world.set(entity, Position, { x: 2 });
    Work.enter(world, entity, Busy);
  });
  expect(result.current.position).toEqual({ x: 2, y: 0 });
  expect(result.current.state).toBe(Busy);

  act(() => world.destroy(entity));
  expect(result.current.position).toBeUndefined();
  expect(result.current.matches).toEqual([]);

  // No world here installed entity methods, so the hooks had none to call.
  expect((entity as unknown as { get?: unknown }).get).toBeUndefined();
});
