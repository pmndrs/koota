import { createWorld, relation, trait, type Entity, type World } from '@koota/core';
import { render, renderHook } from '@testing-library/react';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTarget, useTargets, WorldProvider } from '../src';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;

// An entity is a bare id, so hooks that read one need the provider to name its world.
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <WorldProvider world={world}>{children}</WorldProvider>
    </StrictMode>
  );
}
const Marker = trait();

describe('useTarget', () => {
  beforeEach(() => {
    world = createWorld();
  });

  it('reactively returns the target for an entity relation', () => {
    const Parent = relation({ exclusive: true });
    const subject = world.spawn(Marker);
    const targetA = world.spawn(Marker);
    const targetB = world.spawn(Marker);

    let target: Entity | undefined;
    function Test() {
      target = useTarget(subject, Parent);
      return null;
    }

    act(() => {
      render(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(target).toBeUndefined();

    act(() => {
      world.add(subject, Parent(targetA));
    });
    expect(target).toBe(targetA);

    act(() => {
      world.add(subject, Parent(targetB));
    });
    expect(target).toBe(targetB);

    act(() => {
      world.remove(subject, Parent(targetB));
    });
    expect(target).toBeUndefined();
  });

  it('keeps the first remaining target across removals and additions', () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const targetC = world.spawn();
    const subject = world.spawn(Likes(targetA), Likes(targetB), Likes(targetC));
    const { result } = renderHook(() => useTarget(subject, Likes), { wrapper: Wrapper });
    expect(result.current).toBe(world.targetFor(subject, Likes));
    act(() => {
      world.remove(subject, Likes(targetB));
    });
    expect(result.current).toBe(world.targetFor(subject, Likes));
    act(() => {
      world.remove(subject, Likes(targetA));
    });
    expect(result.current).toBe(world.targetFor(subject, Likes));
    act(() => {
      world.remove(subject, Likes(targetC));
    });
    expect(result.current).toBe(world.targetFor(subject, Likes));
    act(() => {
      world.add(subject, Likes(targetB));
    });
    expect(result.current).toBe(world.targetFor(subject, Likes));
    act(() => {
      world.destroy(targetB);
    });
    expect(result.current).toBe(world.targetFor(subject, Likes));
  });

  it('clears its target when the source is destroyed', () => {
    const Likes = relation();
    const subject = world.spawn(Likes(world.spawn()), Likes(world.spawn()));
    const { result } = renderHook(() => useTarget(subject, Likes), { wrapper: Wrapper });

    act(() => {
      world.destroy(subject);
    });
    expect(result.current).toBeUndefined();
  });

  it('keeps the new source when an old removal is queued', () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const first = world.spawn(Likes(targetA));
    const second = world.spawn(Likes(targetB));
    const { result, rerender } = renderHook(({ entity }) => useTarget(entity, Likes), {
      initialProps: { entity: first },
      wrapper: Wrapper,
    });

    act(() => {
      world.remove(first, Likes(targetA));
      rerender({ entity: second });
    });
    expect(result.current).toBe(targetB);
  });

  it('immediately reflects the correct value when switching entities', () => {
    const Parent = relation({ exclusive: true });
    const entityA = world.spawn();
    const entityB = world.spawn();
    const targetForA = world.spawn();

    world.add(entityA, Parent(targetForA));

    let target: Entity | undefined;
    const targets: (Entity | undefined)[] = [];

    function Test({ entity }: { entity: Entity }) {
      target = useTarget(entity, Parent);
      targets.push(target);
      return null;
    }

    const { rerender } = render(
      <StrictMode>
        <WorldProvider world={world}>
          <Test entity={entityA} />
        </WorldProvider>
      </StrictMode>
    );

    expect(target).toBe(targetForA);
    targets.length = 0;

    act(() => {
      rerender(
        <StrictMode>
          <WorldProvider world={world}>
            <Test entity={entityB} />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(target).toBeUndefined();
    expect(targets.every((t) => t === undefined)).toBe(true);
  });
});

describe('useTargets', () => {
  beforeEach(() => {
    world = createWorld();
  });

  it('drops every target when one removal triggers another', () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const subject = world.spawn(Likes(targetA), Likes(targetB));
    const { result } = renderHook(() => useTargets(subject, Likes), { wrapper: Wrapper });

    // Subscribe after the hook so B is removed while A is still awaiting cleanup.
    world.onRemove(subject, Likes, (entity, target) => {
      if (target === targetA) world.remove(entity, Likes(targetB));
    });

    act(() => {
      world.remove(subject, Likes(targetA));
    });
    expect(result.current).toEqual([]);
  });

  it('reactively returns targets for an entity relation', () => {
    const Likes = relation();
    const subject = world.spawn(Marker);
    const targetA = world.spawn(Marker);
    const targetB = world.spawn(Marker);

    let targets: Entity[] = null!;
    function Test() {
      targets = useTargets(subject, Likes);
      return null;
    }

    act(() => {
      render(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(targets).toEqual([]);

    act(() => {
      world.add(subject, Likes(targetA));
      world.add(subject, Likes(targetB));
    });

    expect([...targets].sort()).toEqual([targetA, targetB].sort());

    act(() => {
      world.remove(subject, Likes(targetA));
    });

    expect(targets).toEqual([targetB]);
  });
});
