import { expect, it, vi } from 'vitest';
import { createWorld, machine, required, trait } from '../src';

it('prepares defaults and copies supplied tuples before removal callbacks', () => {
  const Idle = trait();
  const makeDetails = vi.fn(() => ({ source: 'default' }));
  const Loading = trait({
    requestId: required<number>(),
    attempts: 0,
    position: [0, 0],
    details: makeDetails,
  });
  const Download = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  const entity = world.spawn(Loading({ requestId: 1, attempts: 3, position: [1, 2] }));
  const position: [number, number] = [8, 9];
  const details = { source: 'provided' };
  const previous = vi.fn();
  const stop = entity.onRemove(Loading, () => {
    previous(entity.get(Loading));
    position[0] = 99;
  });

  Download.enter(entity, Loading({ requestId: 2, position, details }));
  expect(previous).toHaveBeenCalledExactlyOnceWith({
    requestId: 1,
    attempts: 3,
    position: [1, 2],
    details: { source: 'default' },
  });
  expect(entity.get(Loading)).toEqual({ requestId: 2, attempts: 0, position: [8, 9], details });
  expect(entity.get(Loading)?.details).toBe(details);
  expect(makeDetails).toHaveBeenCalledOnce();

  stop();
  Download.enter(entity, Loading({ requestId: 3 }));
  expect(entity.get(Loading)).toEqual({
    requestId: 3,
    attempts: 0,
    position: [0, 0],
    details: { source: 'default' },
  });
  expect(makeDetails).toHaveBeenCalledTimes(2);
  world.destroy();
});

it('keeps the current value and skips callbacks when preparation fails', () => {
  let fail = false;
  const Idle = trait();
  const Loading = trait({
    requestId: required<number>(),
    attempts: 0,
    last: () => {
      if (fail) throw new Error('default failed');
      return 1;
    },
  });
  const Download = machine({ states: { Idle, Loading }, initial: Idle });
  const world = createWorld();
  const entity = world.spawn(Loading({ requestId: 1, attempts: 3 }));
  const removed = vi.fn();
  const transitioned = vi.fn();
  entity.onRemove(Loading, removed);
  entity.onTransition(Download, transitioned);

  expect(() => {
    // @ts-expect-error Required fields must still be supplied on self-entry.
    Download.enter(entity, Loading({ attempts: 9 }));
  }).toThrow('[REQUIRED_VALUE]');
  fail = true;
  expect(() => Download.enter(entity, Loading({ requestId: 2, attempts: 9 }))).toThrow(
    'default failed'
  );
  expect(entity.get(Loading)).toEqual({ requestId: 1, attempts: 3, last: 1 });
  expect(removed).not.toHaveBeenCalled();
  expect(transitioned).not.toHaveBeenCalled();

  Download.enter(entity, Loading({ requestId: 3, last: 7 }));
  expect(entity.get(Loading)).toEqual({ requestId: 3, attempts: 0, last: 7 });
  world.destroy();
});

it('preserves factory value identity and tag self-transitions', () => {
  const makeValue = vi.fn(() => ({ progress: 0 }));
  const Value = trait(() => makeValue());
  const Idle = trait();
  const State = machine({ states: { Value, Idle }, initial: Value });
  const world = createWorld();
  const entity = world.spawn(State);
  const first = entity.get(Value);
  const next = { progress: 1 };

  State.enter(entity, Value(next));
  expect(entity.get(Value)).toBe(next);
  expect(makeValue).toHaveBeenCalledOnce();
  State.enter(entity, Value);
  expect(entity.get(Value)).toEqual({ progress: 0 });
  expect(entity.get(Value)).not.toBe(first);
  expect(makeValue).toHaveBeenCalledTimes(2);

  State.enter(entity, Idle);
  const changed = vi.fn();
  const stop = entity.onTransition(State, changed);
  State.enter(entity, Idle);
  expect(changed).toHaveBeenCalledExactlyOnceWith(entity, Idle, Idle, undefined);
  stop();
  world.destroy();
});
