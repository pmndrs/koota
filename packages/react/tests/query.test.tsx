import { createWorld, Name, type Entity, relation, trait, universe, type World } from '@koota/core';
import { render, renderHook } from '@testing-library/react';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useQuery, WorldProvider } from '../src';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Position = trait({ x: 0, y: 0 });
// const Velocity = trait({ x: 0, y: 0 });

describe('useQuery', () => {
  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  it('reactively returns entities matching the query', async () => {
    let entities: Entity[] = null!;

    function Test() {
      entities = useQuery(Position);
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

    expect(entities.length).toBe(0);

    await act(async () => {
      world.spawn(Position);
    });

    expect(entities.length).toBe(1);

    let entityToDestroy: Entity;
    await act(async () => {
      entityToDestroy = world.spawn(Position);
    });

    expect(entities.length).toBe(2);

    await act(async () => {
      entityToDestroy.destroy();
    });

    expect(entities.length).toBe(1);
  });

  it('follows a named entity through rename and replacement', async () => {
    const { result, unmount } = renderHook(() => useQuery(Name('player'), Position), {
      wrapper: ({ children }) => <WorldProvider world={world}>{children}</WorldProvider>,
    });
    expect(result.current).toHaveLength(0);
    let player: Entity;
    await act(async () => {
      player = world.spawn(Name('player'), Position);
    });
    expect([...result.current]).toEqual([player!]);
    await act(async () => {
      player!.set(Name, 'hero');
    });
    expect(result.current).toHaveLength(0);
    await act(async () => {
      player = world.spawn(Name('player'), Position);
    });
    expect([...result.current]).toEqual([player!]);
    unmount();
  });

  it.fails('captures entities added before useEffect runs', async () => {
    // Spawn an initial entity
    world.spawn(Position);

    let entities: Entity[] = null!;

    function Test() {
      entities = useQuery(Position);
      return null;
    }

    // Spawn an entity in the ref callback, which is after the
    // render function but before effects run
    function EntityAdder() {
      return (
        <div
          ref={() => {
            world.spawn(Position);
          }}
        />
      );
    }

    await act(async () => {
      render(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
            <EntityAdder />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(entities.length).toBe(2);
  });

  it('renders once if entities do not change before effect', async () => {
    // Spawn an initial entity
    world.spawn(Position);

    let renderCount = 0;

    function Test() {
      useQuery(Position);
      renderCount++;
      return null;
    }

    // Test without strict mode
    await act(async () => {
      render(
        <WorldProvider world={world}>
          <Test />
        </WorldProvider>
      );
    });

    expect(renderCount).toBe(1);
  });

  it('renders twice if entities change before effect', async () => {
    // Spawn Two initial entities
    const entity = world.spawn(Position);
    world.spawn(Position);

    let renderCount = 0;

    function Test() {
      useQuery(Position);
      renderCount++;
      return null;
    }

    // Add and remove an entity so the total number
    // is the same but the contents change
    function EntityAdder() {
      return (
        <div
          ref={() => {
            world.spawn(Position);
            entity.destroy();
          }}
        />
      );
    }

    await act(async () => {
      render(
        <WorldProvider world={world}>
          <Test />
          <EntityAdder />
        </WorldProvider>
      );
    });

    expect(renderCount).toBe(2);
  });

  it('reactively updates when the world is reset', async () => {
    let entities: Entity[] = null!;

    function Test() {
      entities = useQuery(Position);
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

    expect(entities.length).toBe(0);

    await act(async () => {
      world.spawn(Position);
      world.spawn(Position);
    });

    expect(entities.length).toBe(2);

    await act(async () => {
      world.reset();
    });

    expect(entities.length).toBe(0);

    await act(async () => {
      world.spawn(Position);
    });

    expect(entities.length).toBe(1);
  });

  it('should define special methods on query result', () => {
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <WorldProvider world={world}>{children}</WorldProvider>;
    }
    const { result } = renderHook(
      () => {
        return useQuery();
      },
      { wrapper: Wrapper }
    );

    expect(Array.isArray(result.current)).toBe(true);
  });

  it('should handle relation query when target entity changes', async () => {
    const ChildOf = relation();
    const Tag = trait();

    const parent1 = world.spawn(Tag);
    const parent2 = world.spawn(Tag);

    // Two children of parent1
    world.spawn(Tag, ChildOf(parent1));
    world.spawn(Tag, ChildOf(parent1));
    // One child of parent2
    world.spawn(Tag, ChildOf(parent2));

    let entities: Entity[] = null!;

    function Test({ parent }: { parent: Entity }) {
      entities = useQuery(Tag, ChildOf(parent));
      return null;
    }

    const { rerender } = render(
      <WorldProvider world={world}>
        <Test parent={parent1} />
      </WorldProvider>
    );

    expect(entities.length).toBe(2);

    // Change parent - the query should update to reflect children of parent2
    await act(async () => {
      rerender(
        <WorldProvider world={world}>
          <Test parent={parent2} />
        </WorldProvider>
      );
    });

    expect(entities.length).toBe(1);
  });
});
