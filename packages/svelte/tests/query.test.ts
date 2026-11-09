import { createChanged, createWorld, relation, trait, type Entity } from '@koota/core';
import { render, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import QueryTest from './components/QueryTest.svelte';
import QueryVariadicTest from './components/QueryVariadicTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Position = trait({ x: 0, y: 0 });

describe('useQuery', () => {
  let world = createWorld();

  beforeEach(() => {
    world = createWorld();
  });

  const renderSubject = (props: any) => {
    return render(QueryTest, {
      props,
      context: new Map([[WORLD_KEY, world]]),
    });
  };

  it('reactively returns entities matching the query', async () => {
    const { getByTestId } = renderSubject({
      params: [Position],
    });

    await tick();
    expect(getByTestId('count').textContent).toBe('0');

    world.spawn(Position);
    await tick();
    expect(getByTestId('count').textContent).toBe('1');

    const entityToDestroy = world.spawn(Position);
    await tick();
    expect(getByTestId('count').textContent).toBe('2');

    world.destroy(entityToDestroy);
    await tick();
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('returns initial matches synchronously', () => {
    world.spawn(Position);
    let initialCount = 0;

    renderSubject({
      params: [Position],
      onInitial: (result: Entity[]) => {
        initialCount = result.length;
      },
    });

    expect(initialCount).toBe(1);
  });

  it('keeps the initial tracked batch through mount and shares later batches between readers', async () => {
    const Changed = createChanged();
    const params = [Changed(Position)];
    const entity = world.spawn(Position);
    const other = world.spawn(Position);
    const first = renderSubject({ params });
    const second = renderSubject({ params });
    const counts = () =>
      [first, second].map(({ container }) => within(container).getByTestId('count').textContent);

    await tick();
    expect(counts()).toEqual(['2', '2']);

    world.set(other, Position, { x: 1 });
    await tick();
    expect(counts()).toEqual(['1', '1']);

    world.defer(() => {
      world.set(entity, Position, { y: 1 });
      world.set(other, Position, { y: 1 });
    });
    await tick();
    expect(counts()).toEqual(['2', '2']);
  });

  it('preserves changes to multiple entities until the next component read', async () => {
    const a = world.spawn(Position),
      b = world.spawn(Position);
    const { getByTestId } = renderSubject({ params: [createChanged()(Position)] });
    await tick();
    world.set(a, Position, { x: 1 });
    world.set(b, Position, { x: 1 });
    await tick();
    expect(getByTestId('count').textContent).toBe('2');
  });

  it('reactively updates when the world is reset', async () => {
    const { getByTestId } = renderSubject({
      params: [Position],
    });

    await tick();
    expect(getByTestId('count').textContent).toBe('0');

    world.spawn(Position);
    world.spawn(Position);
    await tick();
    expect(getByTestId('count').textContent).toBe('2');

    world.reset();
    await tick();
    expect(getByTestId('count').textContent).toBe('0');

    world.spawn(Position);
    await tick();
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('does not loop when the world is reset inside an effect', async () => {
    let runs = 0;

    const { getByTestId } = renderSubject({
      params: [Position],
      onEffect: () => {
        runs++;
        world.reset();
        world.spawn(Position);
      },
    });

    await tick();
    await tick();
    expect(runs).toBe(1);
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('returns a plain array', async () => {
    const { getByTestId } = renderSubject({
      params: [],
    });

    await tick();
    expect(getByTestId('is-array').textContent).toBe('true');
  });

  it('supports variadic arguments', async () => {
    const { getByTestId } = render(QueryVariadicTest, {
      context: new Map([[WORLD_KEY, world]]),
      props: { params: [Position] },
    });

    await tick();
    expect(getByTestId('count').textContent).toBe('0');

    world.spawn(Position);
    await tick();
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('should handle relation query when target entity changes', async () => {
    const ChildOf = relation();
    const Tag = trait();

    const parent1 = world.spawn(Tag);
    const parent2 = world.spawn(Tag);

    // Two children of parent1
    world.spawn(Tag, ChildOf(parent1));
    world.spawn(Tag, ChildOf(parent1));

    // One child of parent2
    world.spawn(Tag, ChildOf(parent2));

    const { getByTestId, rerender } = renderSubject({
      params: [Tag, ChildOf(parent1)],
    });

    await tick();
    expect(getByTestId('count').textContent).toBe('2');

    // Change parent - the query should update to reflect children of parent2
    await rerender({ params: [Tag, ChildOf(parent2)] });
    await tick();
    expect(getByTestId('count').textContent).toBe('1');
  });
});
