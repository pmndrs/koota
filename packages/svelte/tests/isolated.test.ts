import { useHas, useQuery, useTarget, useTrait } from '../src';
import { relation, trait } from '@koota/core';
import { createWorld } from '@koota/core/src/isolated';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { expect, it } from 'vitest';
import HookConsumer from './components/hook-consumer.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Position = trait({ x: 0, y: 0 });
const ChildOf = relation();

it('reads and follows entities of an isolated world', async () => {
  const world = createWorld();
  const parent = world.spawn();
  const entity = world.spawn(Position({ x: 1 }), ChildOf(parent));
  let read!: () => unknown;

  const { unmount } = render(HookConsumer, {
    context: new Map([[WORLD_KEY, world]]),
    props: {
      read: () => {
        const position = useTrait(() => entity, Position);
        const has = useHas(() => entity, Position);
        const target = useTarget(() => entity, ChildOf);
        const matches = useQuery(Position);
        read = () => ({
          position: position.current,
          has: has.current,
          parent: target.current,
          matches: [...matches.current],
        });
      },
    },
  });
  await tick();
  expect(read()).toEqual({ position: { x: 1, y: 0 }, has: true, parent, matches: [entity] });

  world.set(entity, Position, { x: 2 });
  await tick();
  expect(read()).toMatchObject({ position: { x: 2, y: 0 } });

  world.destroy(entity);
  await tick();
  expect(read()).toMatchObject({ position: undefined, has: false, matches: [] });

  // No world here installed entity methods, so the bindings had none to call.
  expect((entity as unknown as { get?: unknown }).get).toBeUndefined();
  unmount();
});
