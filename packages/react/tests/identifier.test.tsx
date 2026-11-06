import {
  createWorld,
  identifier,
  type Entity,
  type Identifier,
  type IdentifierKey,
  type World,
} from '@koota/core';
import { cleanup, renderHook } from '@testing-library/react';
import { act, StrictMode, useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { useHas, useQuery, useTarget, WorldProvider } from '../src';

describe('identifier hooks', () => {
  const Name = identifier();
  const WireId = identifier<number>();
  let world: World;

  beforeEach(() => {
    world = createWorld();
  });
  afterEach(() => {
    cleanup();
    world.destroy();
  });

  it('observes typed keys, presence and inline terms through the assignment lifecycle', () => {
    const entity = world.spawn();
    const { result, rerender } = renderHook(
      () => ({
        name: useTarget(entity, Name),
        wireId: useTarget(entity, WireId),
        present: useHas(entity, WireId),
        exact: useHas(entity, WireId(123)),
      }),
      { wrapper: StrictMode }
    );
    expectTypeOf(result.current.name).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.current.wireId).toEqualTypeOf<number | undefined>();
    expect(result.current).toEqual({
      name: undefined,
      wireId: undefined,
      present: false,
      exact: false,
    });

    act(() => entity.add(Name('kris'), WireId(123)));
    expect(result.current).toEqual({ name: 'kris', wireId: 123, present: true, exact: true });
    rerender();
    expect(result.current).toEqual({ name: 'kris', wireId: 123, present: true, exact: true });
    act(() => entity.add(WireId(456)));
    expect(result.current).toEqual({ name: 'kris', wireId: 456, present: true, exact: false });
    act(() => entity.remove(WireId));
    expect(result.current).toEqual({ name: 'kris', wireId: undefined, present: false, exact: false });
    act(() => entity.add(WireId(123)));
    expect(result.current).toEqual({ name: 'kris', wireId: 123, present: true, exact: true });
    act(() => entity.destroy());
    expect(result.current).toEqual({
      name: undefined,
      wireId: undefined,
      present: false,
      exact: false,
    });
  });

  it('switches entities and identifier types and accepts nullish sources', () => {
    const Alias = identifier();
    const first = world.spawn(Name('kris'), Alias('k'));
    const second = world.spawn(Name('sam'), Alias('s'));
    const { result, rerender } = renderHook(
      ({ target, type }: { target: Entity | null | undefined; type: Identifier<string> }) => ({
        value: useTarget(target, type),
        present: useHas(target, type),
      }),
      {
        initialProps: { target: first as Entity | null | undefined, type: Name },
        wrapper: StrictMode,
      }
    );
    expect(result.current).toEqual({ value: 'kris', present: true });
    rerender({ target: second, type: Name });
    expect(result.current).toEqual({ value: 'sam', present: true });
    act(() => first.add(Name('other')));
    expect(result.current).toEqual({ value: 'sam', present: true });
    rerender({ target: second, type: Alias });
    expect(result.current).toEqual({ value: 's', present: true });
    rerender({ target: null, type: Alias });
    expect(result.current).toEqual({ value: undefined, present: false });
    rerender({ target: undefined, type: Alias });
    expect(result.current).toEqual({ value: undefined, present: false });
    act(() => first.destroy());
    rerender({ target: first, type: Name });
    expect(result.current).toEqual({ value: undefined, present: false });
  });

  it('observes every entity sharing a name through rename and destruction', () => {
    const DisplayName = identifier({ exclusive: false });
    const first = world.spawn(DisplayName('kris'));
    const second = world.spawn(DisplayName('kris'));
    const { result } = renderHook(
      () => ({
        entities: useQuery(DisplayName('kris')),
        name: useTarget(second, DisplayName),
        matches: useHas(second, DisplayName('kris')),
      }),
      {
        wrapper: ({ children }) => (
          <StrictMode>
            <WorldProvider world={world}>{children}</WorldProvider>
          </StrictMode>
        ),
      }
    );
    expect(result.current).toEqual({ entities: [first, second], name: 'kris', matches: true });
    act(() => second.add(DisplayName('sam')));
    expect(result.current).toEqual({ entities: [first], name: 'sam', matches: false });
    act(() => first.destroy());
    expect(result.current.entities).toEqual([]);
    act(() => second.add(DisplayName('kris')));
    expect(result.current).toEqual({ entities: [second], name: 'kris', matches: true });
    act(() => second.remove(DisplayName));
    expect(result.current).toEqual({ entities: [], name: undefined, matches: false });
  });

  it('compares inline terms by namespace and scalar key', () => {
    const First = identifier<IdentifierKey>();
    const Second = identifier<IdentifierKey>();
    const entity = world.spawn(First(1), Second(2));
    const { result, rerender } = renderHook(
      ({ type, key }: { type: Identifier<IdentifierKey>; key: IdentifierKey }) =>
        useHas(entity, type(key)),
      { initialProps: { type: First, key: 1 as IdentifierKey }, wrapper: StrictMode }
    );
    expect(result.current).toBe(true);
    rerender({ type: Second, key: 1 });
    expect(result.current).toBe(false);
    rerender({ type: Second, key: 2 });
    expect(result.current).toBe(true);
    rerender({ type: Second, key: '2' });
    expect(result.current).toBe(false);
    act(() => entity.add(Second('2')));
    expect(result.current).toBe(true);
  });

  it('observes identifiers on a world across reset and destruction', () => {
    world.add(WireId(123));
    const { result } = renderHook(
      () => ({
        value: useTarget(world, WireId),
        present: useHas(world, WireId),
        exact: useHas(world, WireId(123)),
      }),
      { wrapper: StrictMode }
    );
    expect(result.current).toEqual({ value: 123, present: true, exact: true });
    act(() => world.reset());
    expect(result.current).toEqual({ value: undefined, present: false, exact: false });
    act(() => world.add(WireId(456)));
    expect(result.current).toEqual({ value: 456, present: true, exact: false });
    act(() => world.destroy());
    expect(result.current).toEqual({ value: undefined, present: false, exact: false });
  });

  it('catches assignments made before subscriptions attach', () => {
    const entity = world.spawn(WireId(123));
    const { result } = renderHook(
      () => {
        const value = useTarget(entity, WireId);
        const exact = useHas(entity, WireId(123));
        useLayoutEffect(() => entity.add(WireId(456)), []);
        return { value, exact };
      },
      { wrapper: StrictMode }
    );
    expect(result.current).toEqual({ value: 456, exact: false });
  });

  it('reads the current mapping when a removal subscriber replaces it again', () => {
    const entity = world.spawn(WireId(123));
    entity.onRemove(WireId(123), () => entity.add(WireId(789)));
    const { result } = renderHook(
      () => ({
        value: useTarget(entity, WireId),
        present: useHas(entity, WireId),
        replaced: useHas(entity, WireId(456)),
        current: useHas(entity, WireId(789)),
      }),
      { wrapper: StrictMode }
    );
    act(() => entity.add(WireId(456)));
    expect(result.current).toEqual({ value: 789, present: true, replaced: false, current: true });
  });
});
