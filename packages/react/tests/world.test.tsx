// oxlint-disable react/globals -- Test components expose hook values to assertions.
import { createWorld, machine, relation, trait, type World } from '@koota/core';
import { render, renderHook } from '@testing-library/react';
import { act, StrictMode, useEffect, useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useHas,
  useMachine,
  useTag,
  useTarget,
  useTargets,
  useTrait,
  useTraitEffect,
  useWorld,
  WorldProvider,
} from '../src';

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

  it('can create a world in useMemo and auto-register on first use', () => {
    let worldTest: World = null!;

    function Test() {
      worldTest = useMemo(() => createWorld(), []);

      useEffect(() => {
        worldTest.spawn();
        return () => worldTest.destroy();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      return null;
    }

    render(
      <StrictMode>
        <Test />
      </StrictMode>
    );

    expect(worldTest).toBeDefined();
    expect(worldTest!.isRegistered).toBe(true);
  });
});

it('requires a provider before reading explicit or nullish targets', () => {
  const world = createWorld();
  const Tag = trait(),
    Link = relation(),
    State = machine({ states: { Tag }, initial: Tag });
  const reads = [
    () => useTrait(world, Tag),
    () => useTraitEffect(world, Tag, () => {}),
    () => useHas(undefined, Tag),
    () => useTag(world, Tag),
    () => useTarget(world, Link),
    () => useTargets(world, Link),
    () => useMachine(world, State),
  ];
  for (const read of reads) expect(() => renderHook(read)).toThrow('within a WorldProvider');
  expect(world.isRegistered).toBe(false);
});
