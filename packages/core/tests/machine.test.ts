import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createWorld,
  trait,
  machine,
  createAdded,
  createRemoved,
  createChanged,
  Not,
  Or,
  relation,
  required,
} from '../src';

function download() {
  const Wanted = trait();
  const Loading = trait({ requestId: 0, attempts: 0 });
  const Failed = trait({ retryAt: 0 });
  const Download = machine({
    states: { Wanted, Loading, Failed },
    initial: Wanted,
    transitions: { Wanted: [Loading], Loading: [Loading, Failed], Failed: [Wanted] },
  });
  return { Wanted, Loading, Failed, Download };
}

describe('machines', () => {
  it('keeps machines independent across entities, worlds and resets', () => {
    const { Wanted, Loading, Download } = download();
    const Visible = trait(),
      Hidden = trait();
    const Visibility = machine({ states: { Visible, Hidden }, initial: Visible });
    const firstWorld = createWorld(),
      secondWorld = createWorld();
    const first = firstWorld.spawn(Download, Visibility);
    const second = secondWorld.spawn(Download);
    Download.enter(first, Loading);
    Visibility.enter(first, Hidden);
    expect(Download.current(first)).toBe(Loading);
    expect(Visibility.current(first)).toBe(Hidden);
    expect(Download.current(second)).toBe(Wanted);
    const removed = vi.fn();
    firstWorld.add(Download);
    firstWorld.onTransition(Download, removed);
    firstWorld.reset();
    expect(removed.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      [Wanted, undefined],
      [Loading, undefined],
    ]);
    expect(Download.current(firstWorld.spawn(Download))).toBe(Wanted);
    expect(Download.current(second)).toBe(Wanted);
    firstWorld.destroy();
    secondWorld.destroy();
  });
  it('composes states with ordinary traits and explicit states override the initial state', () => {
    const { Wanted, Loading, Download } = download();
    const world = createWorld();
    const Tile = trait({ id: 0 });
    const entered = vi.fn();
    world.onTransition(Download, entered);
    const first = world.spawn(Tile, Download);
    const second = world.spawn(Download, Loading({ requestId: 7 }));
    const third = world.spawn(Loading({ requestId: 8 }), Download);
    const tile = world.spawn(Tile({ id: 1 }));
    expect(Download.current(first)).toBe(Wanted);
    expect(second.get(Loading)).toEqual({ requestId: 7, attempts: 0 });
    expect(third.get(Loading)?.requestId).toBe(8);
    expect(world.query(Download).toArray()).toEqual([first, second, third]);
    expect(first.get(Tile)).toEqual({ id: 0 });
    expect(world.query(Loading).toArray()).toEqual([second, third]);
    expect(world.query(Not(Download)).toArray()).toEqual([tile]);
    expect(entered.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      [undefined, Wanted],
      [undefined, Loading],
      [undefined, Loading],
    ]);
    first.add(Download);
    second.add(Loading({ requestId: 99 }));
    expect(second.get(Loading)?.requestId).toBe(7);
    second.set(Loading, { requestId: 9 });
    expect(second.get(Loading)).toEqual({ requestId: 9, attempts: 0 });
    expect(entered).toHaveBeenCalledTimes(3);
    expectTypeOf(Download.current(first)).toEqualTypeOf<
      typeof Wanted | typeof Loading | (typeof Download.states)['Failed'] | undefined
    >();
    world.destroy();
  });

  it('checks transition edges through enter, add and upsert', () => {
    const { Wanted, Loading, Failed, Download } = download();
    const world = createWorld();
    const entity = world.spawn(Download);
    expect(() => Download.enter(entity, Failed)).toThrow('[MACHINE_ILLEGAL_TRANSITION]');
    expect(() => entity.add(Failed)).toThrow('[MACHINE_ILLEGAL_TRANSITION]');
    expect(() => entity.upsert(Failed, { retryAt: 20 })).toThrow('[MACHINE_ILLEGAL_TRANSITION]');
    expect(Download.current(entity)).toBe(Wanted);
    Download.enter(entity, Loading({ requestId: 7, attempts: 3 }));
    Download.enter(entity, Loading({ requestId: 8 }));
    expect(entity.get(Loading)).toEqual({ requestId: 8, attempts: 0 });
    expect(() => entity.add(Wanted)).toThrow('[MACHINE_ILLEGAL_TRANSITION]');
    entity.upsert(Failed, { retryAt: 20 });
    expect(entity.has(Wanted)).toBe(false);
    expect(entity.get(Failed)).toEqual({ retryAt: 20 });
    entity.upsert(Failed, { retryAt: 30 });
    expect(entity.get(Failed)?.retryAt).toBe(30);
    expect(() => entity.remove(Failed)).toThrow('[MACHINE_STATE_REQUIRED]');
    entity.remove(Loading);
    entity.remove(Download);
    expect(Download.current(entity)).toBeUndefined();
    expect(entity.has(Download)).toBe(false);
    Download.enter(entity, Failed);
    expect(Download.current(entity)).toBe(Failed);
    expect(() => Download.enter(entity, trait())).toThrow('[MACHINE_STATE]');
    world.destroy();
  });

  it('reports previous values separately and preserves removal hook reads', () => {
    const { Loading, Failed, Download } = download();
    const world = createWorld();
    const entity = world.spawn(Loading({ requestId: 7 }));
    const removed: unknown[] = [];
    const events: unknown[] = [];
    world.onRemove(Loading, (entity) => removed.push([entity.has(Loading), entity.get(Loading)]));
    const unsubscribe = entity.onTransition(Download, (entity, from, to, previous) => {
      events.push([from, to, previous, entity.get(Loading), Download.current(entity)]);
    });
    Download.enter(entity, Loading({ requestId: 8 }));
    Download.enter(entity, Failed({ retryAt: 20 }));
    expect(removed).toEqual([
      [true, { requestId: 7, attempts: 0 }],
      [true, { requestId: 8, attempts: 0 }],
    ]);
    expect(events).toEqual([
      [Loading, Loading, { requestId: 7, attempts: 0 }, { requestId: 8, attempts: 0 }, Loading],
      [Loading, Failed, { requestId: 8, attempts: 0 }, undefined, Failed],
    ]);
    unsubscribe();
    entity.remove(Download);
    expect(events).toHaveLength(2);
    world.destroy();
  });

  it('scopes transition subscriptions and keeps stale cleanup harmless', () => {
    const { Loading, Download } = download();
    const world = createWorld();
    const entity = world.spawn(Download);
    const other = world.spawn(Download);
    const worldListener = vi.fn();
    const entityListener = vi.fn();
    const stopWorld = world.onTransition(Download, worldListener);
    const stopEntity = entity.onTransition(Download, entityListener);

    Download.enter(other, Loading);
    expect(worldListener).toHaveBeenCalledOnce();
    expect(entityListener).not.toHaveBeenCalled();
    Download.enter(entity, Loading);
    expect(worldListener).toHaveBeenCalledTimes(2);
    expect(entityListener).toHaveBeenCalledOnce();

    stopWorld();
    stopEntity();
    const currentWorld = world.onTransition(Download, worldListener);
    const currentEntity = entity.onTransition(Download, entityListener);
    stopWorld();
    stopEntity();
    Download.enter(entity, Loading);
    expect(worldListener).toHaveBeenCalledTimes(3);
    expect(entityListener).toHaveBeenCalledTimes(2);
    currentWorld();
    currentEntity();
    Download.enter(entity, Loading);
    expect(worldListener).toHaveBeenCalledTimes(3);
    expect(entityListener).toHaveBeenCalledTimes(2);
    world.destroy();
  });

  it('starts subscriptions added during callbacks with the next transition', () => {
    const { Wanted, Loading, Failed, Download } = download();
    const world = createWorld();
    const entity = world.spawn(Loading({ requestId: 7 }));
    const nextWorld = vi.fn();
    const nextEntity = vi.fn();
    const worldListener = vi.fn(() => world.onTransition(Download, nextWorld));
    const entityListener = vi.fn(() => entity.onTransition(Download, nextEntity));
    const stop = entity.onRemove(Loading, () => {
      world.onTransition(Download, worldListener);
      entity.onTransition(Download, entityListener);
    });

    Download.enter(entity, Failed({ retryAt: 20 }));
    for (const callback of [worldListener, entityListener]) expect(callback).not.toHaveBeenCalled();
    Download.enter(entity, Wanted);
    for (const callback of [worldListener, entityListener]) {
      expect(callback).toHaveBeenCalledExactlyOnceWith(entity, Failed, Wanted, { retryAt: 20 });
    }
    for (const callback of [nextWorld, nextEntity]) expect(callback).not.toHaveBeenCalled();
    Download.enter(entity, Loading);
    for (const callback of [nextWorld, nextEntity]) {
      expect(callback).toHaveBeenCalledExactlyOnceWith(entity, Wanted, Loading, undefined);
    }
    stop();
    world.destroy();
  });

  it.each(['onEnter', 'onExit'] as const)(
    'keeps queries consistent during transitions with %s subscribed',
    (hook) => {
      const { Wanted, Loading, Download } = download();
      const world = createWorld();
      const RefersTo = relation();
      const entity = world.spawn(Download);
      const source = world.spawn(RefersTo(entity));
      const machineAdded = vi.fn();
      const machineRemoved = vi.fn();
      const anyStateAdded = vi.fn();
      world.onEnter([Download], machineAdded);
      world.onExit([Download], machineRemoved);
      world.onEnter([Or(Wanted, Loading)], anyStateAdded);
      const remainsMatched = vi.fn();
      world[hook]([Or(RefersTo(Wanted), RefersTo(Loading))], remainsMatched);
      const observations: unknown[] = [];
      world.onEnter([Loading], () =>
        observations.push([
          world.query(Wanted).toArray(),
          world.query(Loading).toArray(),
          world.query(RefersTo(Loading)).toArray(),
        ])
      );
      world.query(RefersTo(Loading));
      Download.enter(entity, Loading);
      expect(observations).toEqual([[[], [entity], [source]]]);
      expect(world.query(Or(RefersTo(Wanted), RefersTo(Loading))).toArray()).toEqual([source]);
      expect(machineAdded).not.toHaveBeenCalled();
      expect(machineRemoved).not.toHaveBeenCalled();
      expect(anyStateAdded).not.toHaveBeenCalled();
      expect(remainsMatched).not.toHaveBeenCalled();

      const reentered = vi.fn();
      world[hook]([Loading], reentered);
      Download.enter(entity, Loading({ requestId: 9 }));
      expect(entity.get(Loading)?.requestId).toBe(9);
      expect(reentered).not.toHaveBeenCalled();
      expect(observations).toHaveLength(1);
      expect(remainsMatched).not.toHaveBeenCalled();
      world.destroy();
    }
  );

  it.each([false, true])(
    'skips queued additions for entities destroyed by an earlier callback (walking: %s)',
    (walking) => {
      const { Wanted, Loading, Download } = download();
      const world = createWorld();
      const RefersTo = relation();
      const target = world.spawn(Download);
      const source = world.spawn(RefersTo(target));
      world.spawn(RefersTo(world.spawn(Loading)));
      const events: string[] = [];
      const stop = world.onExit([Wanted], () => source.destroy());
      world.onEnter([RefersTo(Loading)], () => events.push('add'));
      world.onExit([RefersTo(Loading)], () => events.push('remove'));

      if (walking) world.query(RefersTo(Loading)).each(() => Download.enter(target, Loading));
      else Download.enter(target, Loading);
      expect(source.isAlive()).toBe(false);
      expect(events).toEqual(['remove']);
      stop();
      world.destroy();
    }
  );

  it('skips queued removals when an earlier callback restores query membership', () => {
    const { Wanted, Loading, Download } = download();
    const world = createWorld();
    const RefersTo = relation();
    const target = world.spawn(Download);
    const other = world.spawn(Download);
    const source = world.spawn(RefersTo(target));
    const events: string[] = [];
    world.onEnter([Loading], () => source.add(RefersTo(other)));
    world.onEnter([RefersTo(Wanted)], () => events.push('add'));
    world.onExit([RefersTo(Wanted)], () => events.push('remove'));

    Download.enter(target, Loading);
    expect(world.query(RefersTo(Wanted)).toArray()).toContain(source);
    expect(events).toEqual(['add']);
    world.destroy();
  });

  it('preserves coalesced Added, Removed and Changed semantics', () => {
    const { Wanted, Loading, Failed, Download } = download();
    const world = createWorld();
    const Added = createAdded(),
      Removed = createRemoved(),
      Changed = createChanged();
    const entity = world.spawn(Download);
    world.query(Added(Loading));
    world.query(Removed(Wanted));
    world.query(Changed(Loading));
    world.query(Added(Download));
    world.query(Removed(Download));
    Download.enter(entity, Loading);
    expect(world.query(Added(Loading)).toArray()).toEqual([entity]);
    expect(world.query(Changed(Loading)).toArray()).toEqual([entity]);
    expect(world.query(Removed(Wanted)).toArray()).toEqual([entity]);
    expect(world.query(Added(Download)).length).toBe(0);
    expect(world.query(Removed(Download)).length).toBe(0);
    world.query(Removed(Loading));
    Download.enter(entity, Loading({ requestId: 9 }));
    expect(world.query(Removed(Loading)).length).toBe(0);
    expect(world.query(Added(Loading)).toArray()).toEqual([entity]);
    Download.enter(entity, Loading);
    Download.enter(entity, Failed);
    expect(world.query(Added(Loading)).length).toBe(0);
    entity.remove(Download);
    expect(world.query(Removed(Download)).toArray()).toEqual([entity]);
    world.destroy();
  });

  it.each([false, true])('keeps replacement values after each writeback (tracked: %s)', (tracked) => {
    const Value = trait(() => ({ n: 0 }));
    const Tuple = trait({ xy: [0, 0] });
    const State = machine({ states: { Value, Tuple }, initial: Value });
    const world = createWorld();
    const entity = world.spawn(State);
    if (tracked) {
      world.query(createChanged()(Value));
      world.query(createChanged()(Tuple));
    }
    world.query(Value).each((_value, entity) => State.enter(entity, Value({ n: 7 })));
    expect(entity.get(Value)).toEqual({ n: 7 });
    State.enter(entity, Tuple);
    world.query(Tuple).each((_tuple, entity) => {
      State.enter(entity, Value);
      State.enter(entity, Tuple({ xy: [8, 9] }));
    });
    expect(entity.get(Tuple)).toEqual({ xy: [8, 9] });
    world.destroy();
  });

  it('updates membership during a walk and visits each starting entity once', () => {
    const { Wanted, Loading, Download } = download();
    const world = createWorld();
    const entities = Array.from({ length: 3 }, () => world.spawn(Download));
    const visited: unknown[] = [];
    world.query(Wanted).each((entity) => {
      visited.push(entity);
      Download.enter(entity, Loading);
      expect(entity.has(Wanted)).toBe(false);
      expect(Download.current(entity)).toBe(Loading);
      expect(world.query(Wanted).toArray()).not.toContain(entity);
    });
    expect(visited).toEqual(entities);
    expect(world.query(Loading).toArray()).toEqual(entities);
    world.destroy();
  });

  it('preserves the old state when initializing another state fails', () => {
    const Idle = trait();
    const Value = trait({
      first: 0,
      last: () => {
        throw new Error('failed');
      },
    });
    const State = machine({ states: { Idle, Value }, initial: Idle });
    const world = createWorld();
    const entity = world.spawn(State);
    expect(() => State.enter(entity, Value)).toThrow('failed');
    expect(State.current(entity)).toBe(Idle);
    world.destroy();
  });

  it('rejects reentrant mutation, releases the lock after errors, and permits other entities', () => {
    const { Loading, Failed, Download } = download();
    const world = createWorld();
    const entity = world.spawn(Download);
    const other = world.spawn(Download);
    const stop = entity.onTransition(Download, () => {
      expect(() => Download.enter(entity, Failed)).toThrow('[MACHINE_REENTRANT]');
      expect(() => entity.destroy()).toThrow('[MACHINE_REENTRANT]');
      Download.enter(other, Loading);
      throw new Error('subscriber');
    });
    expect(() => Download.enter(entity, Loading)).toThrow('subscriber');
    expect(Download.current(entity)).toBe(Loading);
    expect(Download.current(other)).toBe(Loading);
    stop();
    entity.add(Failed);
    expect(Download.current(entity)).toBe(Failed);
    world.destroy();
  });

  it('removes machines once on destruction and retains state data across mask words', () => {
    const A = trait({ value: 7 }),
      B = trait();
    const State = machine({ states: { A, B }, initial: A });
    const world = createWorld();
    world.query(A);
    for (let i = 0; i < 35; i++) world.query(trait());
    const entity = world.spawn(State);
    const Removed = createRemoved();
    world.query(Removed(A), State);
    const events = vi.fn();
    world.onTransition(State, events);
    entity.destroy();
    expect(events).toHaveBeenCalledExactlyOnceWith(entity, A, undefined, { value: 7 });
    const values: unknown[] = [];
    world.query(Removed(A), State).each((value) => values.push({ value: value.value }));
    expect(values).toEqual([{ value: 7 }]);
    world.destroy();
  });

  it('validates declaration and duplicate members without changing machine membership', () => {
    const { Wanted, Loading, Download } = download();
    const world = createWorld();
    const entity = world.spawn(Download);
    expect(() => entity.add(Loading, Wanted)).toThrow('[MACHINE_MULTIPLE_STATES]');
    expect(Download.current(entity)).toBe(Wanted);
    expect(() => machine({ states: { Wanted }, initial: Wanted })).toThrow('[MACHINE_MEMBER_TAKEN]');
    const Used = trait();
    world.query(Used);
    expect(() => machine({ states: { Used }, initial: Used })).toThrow('[MACHINE_REGISTERED]');
    const A = trait(),
      B = trait();
    expect(() => machine({ states: { A }, initial: A, transitions: { A: [B] } })).toThrow(
      '[MACHINE_TRANSITIONS]'
    );
    const Required = trait({ value: required<number>() });
    // @ts-expect-error Initial states need defaults.
    expect(() => machine({ states: { Required }, initial: Required })).toThrow('[MACHINE_INITIAL]');
    const State = machine({ states: { A, Required }, initial: A });
    State.enter(entity, Required({ value: 4 }));
    expect(entity.get(Required)).toEqual({ value: 4 });
    expectTypeOf(() => {
      // @ts-expect-error Required fields must be supplied on entry.
      State.enter(entity, Required);
      // @ts-expect-error State schemas are preserved.
      Download.enter(entity, Loading({ requestId: 'wrong' }));
    }).toBeFunction();
    world.destroy();
  });
});
