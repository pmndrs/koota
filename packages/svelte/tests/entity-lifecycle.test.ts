import { createWorld, relation, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHas, useTag, useTarget, useTargets, useTrait, useTraitEffect } from '../src';
import EntityLifecycleTest from './components/entity-lifecycle-test.svelte';

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
      bind: (target: () => Entity) => useTrait(target, Position),
      empty: undefined,
    },
    {
      name: 'useHas',
      bind: (target: () => Entity) => useHas(target, Position),
      empty: false,
    },
    {
      name: 'useTag',
      bind: (target: () => Entity) => useTag(target, IsTagged),
      empty: false,
    },
    {
      name: 'useTarget',
      bind: (target: () => Entity) => useTarget(target, ChildOf),
      empty: undefined,
    },
    {
      name: 'useTargets',
      bind: (target: () => Entity) => useTargets(target, ChildOf),
      empty: [],
    },
  ])('$name', ({ bind, empty }) => {
    it('treats a destroyed target as empty and can switch to a live entity', async () => {
      const entity = world.spawn(Position, IsTagged, ChildOf(world.spawn()));
      entity.destroy();
      const onInitial = vi.fn();

      const { getByTestId, rerender } = render(EntityLifecycleTest, {
        props: { target: entity, bind, onInitial },
      });
      await tick();

      expect(onInitial).toHaveBeenCalledWith(empty);
      expect(getByTestId('value').textContent).toBe(JSON.stringify(empty) ?? 'undefined');

      const next = world.spawn(Position, IsTagged, ChildOf(world.spawn()));
      await rerender({ target: next });
      expect(getByTestId('value').textContent).not.toBe(JSON.stringify(empty) ?? 'undefined');

      next.destroy();
      await tick();
      expect(getByTestId('value').textContent).toBe(JSON.stringify(empty) ?? 'undefined');
    });

    it('skips an entity destroyed between render and subscription', async () => {
      const entity = world.spawn(Position, IsTagged, ChildOf(world.spawn()));
      const onInitial = vi.fn();

      const { getByTestId } = render(EntityLifecycleTest, {
        props: {
          target: entity,
          bind,
          onInitial,
          beforeEffects: () => entity.destroy(),
        },
      });
      await tick();

      expect(onInitial).toHaveBeenCalledOnce();
      expect(onInitial.mock.calls[0][0]).not.toEqual(empty);
      expect(entity.isAlive()).toBe(false);
      expect(getByTestId('value').textContent).toBe(JSON.stringify(empty) ?? 'undefined');
    });
  });

  describe('useTraitEffect', () => {
    it('skips an entity destroyed before render', async () => {
      const entity = world.spawn(Position);
      entity.destroy();
      const notify = vi.fn();

      render(EntityLifecycleTest, {
        props: {
          target: entity,
          bind: (target: () => Entity) => {
            useTraitEffect(target, Position, notify);
            return undefined;
          },
        },
      });
      await tick();

      expect(notify).not.toHaveBeenCalled();
    });

    it('skips an entity destroyed between render and the effect', async () => {
      const entity = world.spawn(Position);
      const notify = vi.fn();

      render(EntityLifecycleTest, {
        props: {
          target: entity,
          bind: (target: () => Entity) => {
            useTraitEffect(target, Position, notify);
            return undefined;
          },
          beforeEffects: () => entity.destroy(),
        },
      });
      await tick();

      expect(entity.isAlive()).toBe(false);
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
