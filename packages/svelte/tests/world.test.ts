import { createWorld, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import WorldTest from './components/WorldTest.svelte';

describe('World', () => {
  it('provides a world to its children', () => {
    const world = createWorld();
    let worldTest: World | null = null;

    render(WorldTest, {
      props: {
        world,
        onWorld: (w: World) => {
          worldTest = w;
        },
      },
    });

    expect(worldTest).toBe(world);
    const entity = worldTest!.spawn();
    expect(worldTest!.isAlive(entity)).toBe(true);
  });
});
