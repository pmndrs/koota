import { createWorld, trait, universe, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EntityLifecycleTest from './components/entity-lifecycle-test.svelte';

describe('entity lifecycle', () => {
  let world: World;
  const Position = trait({ x: 0 });

  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  it('safely renders an entity that has already been destroyed', async () => {
    const entity = world.spawn(Position);
    entity.destroy();
    const notify = vi.fn();

    const { getByTestId } = render(EntityLifecycleTest, {
      props: { target: entity, trait: Position, onChange: notify },
    });
    await tick();

    expect(getByTestId('value').textContent).toBe('undefined');
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips an entity destroyed between render and effects', async () => {
    const entity = world.spawn(Position);
    const notify = vi.fn();

    const { getByTestId } = render(EntityLifecycleTest, {
      props: {
        target: entity,
        trait: Position,
        onChange: notify,
        beforeEffects: () => entity.destroy(),
      },
    });
    await tick();

    expect(entity.isAlive()).toBe(false);
    expect(getByTestId('value').textContent).toBe('undefined');
    expect(notify).not.toHaveBeenCalled();
  });
});
