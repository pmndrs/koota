import { createWorld, trait, universe, type World } from '@koota/core';
import { renderHook } from '@testing-library/react';
import { StrictMode, useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrait, useTraitEffect } from '../src';

describe('entity lifecycle', () => {
  let world: World;
  const Position = trait({ x: 0 });

  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  it('safely renders an entity that has already been destroyed', () => {
    const entity = world.spawn(Position);
    entity.destroy();
    const notify = vi.fn();

    const { result } = renderHook(
      () => {
        useTraitEffect(entity, Position, notify);
        return useTrait(entity, Position);
      },
      { wrapper: StrictMode }
    );

    expect(result.current).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips an entity destroyed between render and effects', () => {
    const entity = world.spawn(Position);
    const notify = vi.fn();

    renderHook(
      () => {
        const position = useTrait(entity, Position);
        useTraitEffect(entity, Position, notify);
        useLayoutEffect(() => {
          if (entity.isAlive()) entity.destroy();
        }, []);
        return position;
      },
      { wrapper: StrictMode }
    );

    expect(entity.isAlive()).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
