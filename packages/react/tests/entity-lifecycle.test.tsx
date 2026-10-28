import { createWorld, relation, trait, universe, type Entity, type World } from '@koota/core';
import { renderHook } from '@testing-library/react';
import { StrictMode, useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHas, useTarget, useTargets, useTrait, useTraitEffect } from '../src';

describe('entity lifecycle', () => {
  let world: World;
  const Position = trait({ x: 0 });
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
    it('returns an empty value for an entity destroyed before render', () => {
      const entity = world.spawn(Position, ChildOf(world.spawn()));
      entity.destroy();

      const { result } = renderHook(() => useValue(entity), { wrapper: StrictMode });

      expect(result.current).toEqual(empty);
    });

    it('skips an entity destroyed between render and subscription', () => {
      const entity = world.spawn(Position, ChildOf(world.spawn()));

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
