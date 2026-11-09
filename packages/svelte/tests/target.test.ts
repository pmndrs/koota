import { createWorld, relation, trait } from '@koota/core';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import TargetTest from './components/TargetTest.svelte';
import TargetsTest from './components/TargetsTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Marker = trait();

describe('useTarget', () => {
  let world = createWorld();

  const renderSubject = (props: any) => {
    return render(TargetTest, {
      context: new Map([[WORLD_KEY, world]]),
      props,
    });
  };

  beforeEach(() => {
    world = createWorld();
  });

  it('handles an unregistered world', () => {
    const Parent = relation();
    const { getByTestId } = renderSubject({ target: world, relation: Parent });

    flushSync();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('reactively returns the target for an entity relation', () => {
    const Parent = relation({ exclusive: true });
    const subject = world.spawn(Marker);
    const targetA = world.spawn(Marker);
    const targetB = world.spawn(Marker);

    const { getByTestId } = renderSubject({
      target: subject,
      relation: Parent,
    });

    flushSync();
    expect(getByTestId('value').textContent).toBe('undefined');

    world.add(subject, Parent(targetA));
    flushSync();
    expect(getByTestId('value').textContent).toBe(String(targetA));

    world.add(subject, Parent(targetB));
    flushSync();
    expect(getByTestId('value').textContent).toBe(String(targetB));

    world.remove(subject, Parent(targetB));
    flushSync();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('returns a remaining target when one is removed', () => {
    const Parent = relation();
    const removedTarget = world.spawn();
    const remainingTarget = world.spawn();
    const subject = world.spawn(Parent(removedTarget), Parent(remainingTarget));
    const { getByTestId } = renderSubject({ target: subject, relation: Parent });

    flushSync();
    world.remove(subject, Parent(removedTarget));
    flushSync();
    expect(getByTestId('value').textContent).toBe(String(remainingTarget));
  });

  it('keeps the first remaining target across removals and additions', () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const targetC = world.spawn();
    const subject = world.spawn(Likes(targetA), Likes(targetB), Likes(targetC));
    const { getByTestId } = renderSubject({ target: subject, relation: Likes });
    flushSync();
    expect(getByTestId('value').textContent).toBe(
      String(world.targetFor(subject, Likes) ?? 'undefined')
    );
    world.remove(subject, Likes(targetB));
    flushSync();
    expect(getByTestId('value').textContent).toBe(
      String(world.targetFor(subject, Likes) ?? 'undefined')
    );
    world.remove(subject, Likes(targetA));
    flushSync();
    expect(getByTestId('value').textContent).toBe(
      String(world.targetFor(subject, Likes) ?? 'undefined')
    );
    world.remove(subject, Likes(targetC));
    flushSync();
    expect(getByTestId('value').textContent).toBe(
      String(world.targetFor(subject, Likes) ?? 'undefined')
    );
    world.add(subject, Likes(targetB));
    flushSync();
    expect(getByTestId('value').textContent).toBe(
      String(world.targetFor(subject, Likes) ?? 'undefined')
    );
    world.destroy(targetB);
    flushSync();
    expect(getByTestId('value').textContent).toBe(
      String(world.targetFor(subject, Likes) ?? 'undefined')
    );
  });

  it('clears its target when the source is destroyed', () => {
    const Likes = relation();
    const subject = world.spawn(Likes(world.spawn()), Likes(world.spawn()));
    const { getByTestId } = renderSubject({ target: subject, relation: Likes });

    flushSync();
    world.destroy(subject);
    flushSync();
    expect(getByTestId('value').textContent).toBe('undefined');
  });

  it('keeps the new source when an old removal is queued', () => {
    const Likes = relation();
    const targetA = world.spawn();
    const targetB = world.spawn();
    const first = world.spawn(Likes(targetA));
    const second = world.spawn(Likes(targetB));
    const { getByTestId, rerender } = renderSubject({ target: first, relation: Likes });

    flushSync();
    world.remove(first, Likes(targetA));
    flushSync(() => {
      void rerender({ target: second, relation: Likes });
    });
    expect(getByTestId('value').textContent).toBe(String(targetB));
  });

  it('immediately reflects the correct value when switching entities', () => {
    const Parent = relation({ exclusive: true });
    const entityA = world.spawn();
    const entityB = world.spawn();
    const targetForA = world.spawn();
    world.add(entityA, Parent(targetForA));

    const { getByTestId, rerender } = renderSubject({
      target: entityA,
      relation: Parent,
    });

    flushSync();
    expect(getByTestId('value').textContent).toBe(String(targetForA));

    flushSync(() => {
      void rerender({ target: entityB, relation: Parent });
    });
    expect(getByTestId('value').textContent).toBe('undefined');
  });
});

describe('useTargets', () => {
  let world = createWorld();

  const renderSubject = (props: any) => {
    return render(TargetsTest, {
      context: new Map([[WORLD_KEY, world]]),
      props,
    });
  };

  beforeEach(() => {
    world = createWorld();
  });

  it('handles an unregistered world', () => {
    const Contains = relation();
    const { getByTestId } = renderSubject({ target: world, relation: Contains });

    flushSync();
    expect(getByTestId('count').textContent).toBe('0');
  });

  it('reactively returns targets for an entity relation', () => {
    const Likes = relation();
    const subject = world.spawn(Marker);
    const targetA = world.spawn(Marker);
    const targetB = world.spawn(Marker);

    const { getByTestId } = renderSubject({
      target: subject,
      relation: Likes,
    });

    flushSync();
    expect(getByTestId('count').textContent).toBe('0');

    world.add(subject, Likes(targetA));
    world.add(subject, Likes(targetB));
    flushSync();
    expect(getByTestId('count').textContent).toBe('2');

    world.remove(subject, Likes(targetA));
    flushSync();
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('does not loop when a pair is removed inside an effect', () => {
    const Likes = relation();
    const targetA = world.spawn(Marker);
    const targetB = world.spawn(Marker);
    const subject = world.spawn(Likes(targetA), Likes(targetB));
    let runs = 0;

    const { getByTestId } = renderSubject({
      target: subject,
      relation: Likes,
      onEffect: () => {
        runs++;
        world.remove(subject, Likes(targetA));
      },
    });

    flushSync();
    expect(runs).toBe(1);
    expect(getByTestId('count').textContent).toBe('1');
  });
});
