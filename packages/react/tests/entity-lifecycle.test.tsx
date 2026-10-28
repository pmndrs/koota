import { createWorld, relation, trait, universe, type Entity, type World } from '@koota/core';
import { renderHook } from '@testing-library/react';
import { act, StrictMode, useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHas, useTag, useTarget, useTargets, useTrait, useTraitEffect } from '../src';

describe('entity lifecycle', () => {
  let world: World;
  const Position = trait({ x: 0 });
  const IsTagged = trait();
  const ChildOf = relation({ exclusive: true });

  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  describe.each([
    {
      name: 'useTrait',
      useValue: (entity: Entity) => useTrait(entity, Position),
      empty: undefined,
    },
    {
      name: 'useHas',
      useValue: (entity: Entity) => useHas(entity, Position),
      empty: false,
    },
    {
      name: 'useTag',
      useValue: (entity: Entity) => useTag(entity, IsTagged),
      empty: false,
    },
    {
      name: 'useTarget',
      useValue: (entity: Entity) => useTarget(entity, ChildOf),
      empty: undefined,
    },
    {
      name: 'useTargets',
      useValue: (entity: Entity) => useTargets(entity, ChildOf),
      empty: [],
    },
  ])('$name', ({ useValue, empty }) => {
    it('treats a destroyed target as empty and can switch to a live entity', async () => {
      const entity = world.spawn(Position, IsTagged, ChildOf(world.spawn()));
      entity.destroy();

      const { result, rerender } = renderHook(({ entity }) => useValue(entity), {
        initialProps: { entity },
        wrapper: StrictMode,
      });

      expect(result.current).toEqual(empty);

      const next = world.spawn(Position, IsTagged, ChildOf(world.spawn()));
      rerender({ entity: next });
      expect(result.current).not.toEqual(empty);

      await act(async () => next.destroy());
      expect(result.current).toEqual(empty);
    });

    it('skips an entity destroyed between render and subscription', () => {
      const entity = world.spawn(Position, IsTagged, ChildOf(world.spawn()));

      const { unmount } = renderHook(
        () => {
          const value = useValue(entity);
          useLayoutEffect(() => {
            if (entity.isAlive()) entity.destroy();
          }, []);
          return value;
        },
        { wrapper: StrictMode }
      );

      expect(entity.isAlive()).toBe(false);
      unmount();
    });
  });

  describe('useTraitEffect', () => {
    it('skips an entity destroyed before render', () => {
      const entity = world.spawn(Position);
      entity.destroy();
      const notify = vi.fn();

      renderHook(() => useTraitEffect(entity, Position, notify), { wrapper: StrictMode });

      expect(notify).not.toHaveBeenCalled();
    });

    it('skips an entity destroyed between render and the effect', () => {
      const entity = world.spawn(Position);
      const notify = vi.fn();

      const { unmount } = renderHook(
        () => {
          useTraitEffect(entity, Position, notify);
          useLayoutEffect(() => {
            if (entity.isAlive()) entity.destroy();
          }, []);
        },
        { wrapper: StrictMode }
      );

      expect(entity.isAlive()).toBe(false);
      expect(notify).not.toHaveBeenCalled();
      unmount();
    });
  });
});
