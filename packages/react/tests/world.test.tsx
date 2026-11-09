import { createWorld, type World } from '@koota/core';
import { render } from '@testing-library/react';
import { act, StrictMode, useEffect, useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorld, WorldProvider } from '../src';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;

describe('World', () => {
  beforeEach(() => {
    world = createWorld();
  });

  it('provides a world to its children', async () => {
    let worldTest: World | null = null;

    function Test() {
      worldTest = useWorld();
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

    expect(worldTest).toBe(world);
  });

  it('can create a world in useMemo and use it across strict effects', () => {
    let worldTest: World = null!;

    function Test() {
      worldTest = useMemo(() => createWorld(), []);

      // A world nothing refers to is collected, so the one a discarded render made needs no cleanup.
      useEffect(() => {
        const entity = worldTest.spawn();
        return () => worldTest.destroy(entity);
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      return null;
    }

    render(
      <StrictMode>
        <Test />
      </StrictMode>
    );

    expect(worldTest).toBeDefined();
    expect(worldTest!.entities.length).toBe(2);
  });
});
