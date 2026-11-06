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
const Marker = trait();

describe('useTarget', () => {
  beforeEach(() => {
    world = createWorld();
  });

  it('reactively returns the target for an entity relation', async () => {
    const Parent = relation({ exclusive: true });
    const subject = world.spawn(Marker);
    const targetA = world.spawn(Marker);
    const targetB = world.spawn(Marker);

    let target: Entity | undefined;
    function Test() {
      target = useTarget(subject, Parent);
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

    expect(target).toBeUndefined();

    await act(async () => {
      subject.add(Parent(targetA));
    });
    expect(target).toBe(targetA);

    await act(async () => {
      subject.add(Parent(targetB));
    });
    expect(target).toBe(targetB);

    await act(async () => {
      subject.remove(Parent(targetB));
    });
    expect(target).toBeUndefined();
  });

  it('keeps the first remaining target across removals and additions', async () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const targetC = world.spawn();
    const subject = world.spawn(Likes(targetA), Likes(targetB), Likes(targetC));
    const { result } = renderHook(() => useTarget(subject, Likes));
    expect(result.current).toBe(subject.targetFor(Likes));
    await act(async () => {
      subject.remove(Likes(targetB));
    });
    expect(result.current).toBe(subject.targetFor(Likes));
    await act(async () => {
      subject.remove(Likes(targetA));
    });
    expect(result.current).toBe(subject.targetFor(Likes));
    await act(async () => {
      subject.remove(Likes(targetC));
    });
    expect(result.current).toBe(subject.targetFor(Likes));
    await act(async () => {
      subject.add(Likes(targetB));
    });
    expect(result.current).toBe(subject.targetFor(Likes));
    await act(async () => {
      targetB.destroy();
    });
    expect(result.current).toBe(subject.targetFor(Likes));
  });

  it('matches targetFor when one removal triggers another', async () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const targetC = world.spawn();
    const targetD = world.spawn();
    const subject = world.spawn(Likes(targetA), Likes(targetB), Likes(targetC), Likes(targetD));
    const { result } = renderHook(() => useTarget(subject, Likes));
    subject.onRemove(Likes, (entity, removed) => {
      if (removed === targetA) entity.remove(Likes(targetB));
    });
    await act(async () => {
      subject.remove(Likes(targetA));
    });
    expect(result.current).toBe(subject.targetFor(Likes));
  });

  it('does not restore a removed target when its removal adds another', async () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const subject = world.spawn(Likes(targetA));
    const { result } = renderHook(() => useTarget(subject, Likes));
    subject.onRemove(Likes, (entity, removed) => {
      if (removed === targetA) entity.add(Likes(targetB));
    });
    await act(async () => {
      subject.remove(Likes(targetA));
    });
    expect(result.current).toBe(subject.targetFor(Likes));
  });

  it('clears its target when the whole relation is removed', async () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const subject = world.spawn(Likes(targetA), Likes(targetB));
    const { result } = renderHook(() => useTarget(subject, Likes));
    await act(async () => {
      subject.remove(Likes('*'));
    });
    expect(result.current).toBe(subject.targetFor(Likes));
  });

  it('clears its target when the source is destroyed', async () => {
    const Likes = relation();
    const subject = world.spawn(Likes(world.spawn()), Likes(world.spawn()));
    const { result } = renderHook(() => useTarget(subject, Likes));

    await act(async () => {
      subject.destroy();
    });
    expect(result.current).toBeUndefined();
  });

  it('keeps the new source when an old removal is queued', async () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const first = world.spawn(Likes(targetA));
    const second = world.spawn(Likes(targetB));
    const { result, rerender } = renderHook(({ entity }) => useTarget(entity, Likes), {
      initialProps: { entity: first },
      wrapper: StrictMode,
    });

    await act(async () => {
      first.remove(Likes(targetA));
      rerender({ entity: second });
    });
    expect(result.current).toBe(targetB);
  });

  it('immediately reflects the correct value when switching entities', async () => {
    const Parent = relation({ exclusive: true });
    const entityA = world.spawn();
    const entityB = world.spawn();
    const targetForA = world.spawn();

    entityA.add(Parent(targetForA));

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

    await act(async () => {
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

  it('drops every target when one removal triggers another', async () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const subject = world.spawn(Likes(targetA), Likes(targetB));
    const { result } = renderHook(() => useTargets(subject, Likes));

    // Subscribe after the hook so B is removed while A is still awaiting cleanup.
    subject.onRemove(Likes, (entity, target) => {
      if (target === targetA) entity.remove(Likes(targetB));
    });

    await act(async () => {
      subject.remove(Likes(targetA));
    });
    expect(result.current).toEqual([]);
  });

  it('reactively returns targets for an entity relation', async () => {
    const Likes = relation();
    const subject = world.spawn(Marker);
    const targetA = world.spawn(Marker);
    const targetB = world.spawn(Marker);

    let targets: Entity[] = null!;
    function Test() {
      targets = useTargets(subject, Likes);
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

    expect(targets).toEqual([]);

    await act(async () => {
      subject.add(Likes(targetA));
      subject.add(Likes(targetB));
    });

    expect([...targets].sort()).toEqual([targetA, targetB].sort());

    await act(async () => {
      subject.remove(Likes(targetA));
    });

    expect(targets).toEqual([targetB]);
  });
});
