import { useHas, useMachine, useTag, useTarget, useTargets, useTrait, useTraitEffect } from '../src';
import HookConsumer from './components/hook-consumer.svelte';
import { createWorld, machine, relation, trait, type World } from '@koota/core';
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
    expect(worldTest!.has(entity)).toBe(true);
  });
});

it('requires a provider before reading explicit or nullish targets', () => {
  const world = createWorld();
  const Tag = trait(),
    Link = relation(),
    State = machine({ states: { Tag }, initial: Tag });
  const reads = [
    () => useTrait(() => world, Tag),
    () =>
      useTraitEffect(
        () => world,
        Tag,
        () => {}
      ),
    () => useHas(() => undefined, Tag),
    () => useTag(() => world, Tag),
    () => useTarget(() => world, Link),
    () => useTargets(() => world, Link),
    () => useMachine(() => world, State),
  ];
  for (const read of reads)
    expect(() => render(HookConsumer, { props: { read } })).toThrow('called provideWorld');
});
