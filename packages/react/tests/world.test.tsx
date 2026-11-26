// oxlint-disable react/globals -- Test components expose hook values to assertions.
import { createWorld, machine, relation, trait, type World } from '@koota/core';
import { render, renderHook } from '@testing-library/react';
import {
  Activity,
  act,
  StrictMode,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useHas,
  useMachine,
  useQuery,
  useTag,
  useTarget,
  useTargets,
  useTrait,
  useTraitEffect,
  useWorld,
  WorldProvider,
} from '../src';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;

describe('World', () => {
  beforeEach(() => {
    world = createWorld();
  });

  it('provides a world to its children', async () => {
    let worldTest: World | null = null;

    function Test() {
      worldTest = useWorld();
      return null;
    }

    await act(async () => {
      render(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(worldTest).toBe(world);
  });
});

it('owns a world created and destroyed in a layout effect', () => {
  const Tag = trait();
  const worlds: World[] = [];
  let count = 0;

  function Owner({ children }: { children: ReactNode }) {
    const [world, setWorld] = useState<World | null>(null);
    useLayoutEffect(() => {
      const world = createWorld();
      worlds.push(world);
      // oxlint-disable-next-line react/set-state-in-effect -- The effect publishes the world it owns.
      setWorld(world);
      return () => {
        // Clearing the state keeps children off the destroyed world.
        setWorld(null);
        world.destroy();
      };
    }, []);
    return world ? <WorldProvider world={world}>{children}</WorldProvider> : null;
  }

  function Child() {
    const world = useWorld();
    count = useQuery(Tag).length;
    useEffect(() => {
      const entity = world.spawn(Tag);
      return () => world.destroy(entity);
    }, [world]);
    return null;
  }

  const tree = (mode: 'visible' | 'hidden') => (
    <StrictMode>
      <Activity mode={mode}>
        <Owner>
          <Child />
        </Owner>
      </Activity>
    </StrictMode>
  );
  const view = render(tree('visible'));
  expect(count).toBe(1);
  act(() => view.rerender(tree('hidden')));
  act(() => view.rerender(tree('visible')));
  expect(count).toBe(1);
  view.unmount();
  // Every world an effect made was destroyed by its cleanup.
  expect(worlds.every((world) => world.entities.length === 0)).toBe(true);
});

it('requires a provider before reading explicit or nullish targets', () => {
  const world = createWorld();
  const Tag = trait(),
    Link = relation(),
    State = machine({ states: { Tag }, initial: Tag });
  const reads = [
    () => useTrait(world, Tag),
    () => useTraitEffect(world, Tag, () => {}),
    () => useHas(undefined, Tag),
    () => useTag(world, Tag),
    () => useTarget(world, Link),
    () => useTargets(world, Link),
    () => useMachine(world, State),
  ];
  for (const read of reads) expect(() => renderHook(read)).toThrow('within a WorldProvider');
});
