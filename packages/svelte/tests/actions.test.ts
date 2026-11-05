import { createActions, createWorld, trait, type Entity } from '@koota/core';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ActionsTest from './components/ActionsTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Position = trait({ x: 0, y: 0 });

describe('useActions', () => {
  it('returns actions bound to the world in context', () => {
    const actions = createActions((world) => ({
      spawnBody: () => world.spawn(Position),
    }));

    let spawnedEntity: Entity | undefined;

    render(ActionsTest, {
      context: new Map([[WORLD_KEY, createWorld()]]),
      props: {
        actions,
        onActions: (boundActions: Record<string, any>) => {
          spawnedEntity = boundActions.spawnBody();
        },
      },
    });

    expect(spawnedEntity).toBeDefined();
  });
});
