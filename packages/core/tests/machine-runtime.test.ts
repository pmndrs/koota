import { afterAll, expect, it, vi } from 'vitest';
import { createWorld, machine, trait } from '../src';

vi.hoisted(() => {
  vi.stubGlobal('__KOOTA_ASSERTS__', false);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it.each(['add', 'upsert'] as const)(
  'enforces transitions through %s with assertions disabled',
  (operation) => {
    const Pending = trait({ attempts: 0 });
    const Loading = trait({ progress: 0 });
    const Loaded = trait();
    const Asset = machine({
      states: { Pending, Loading, Loaded },
      initial: Pending,
      transitions: { Pending: [Loading], Loading: [Loaded] },
    });
    const world = createWorld();
    try {
      const entity = world.spawn(Pending({ attempts: 3 }));
      const changed = vi.fn();
      entity.onRemove(Pending, changed);
      entity.onAdd(Loaded, changed);
      entity.onTransition(Asset, changed);

      expect(() => {
        if (operation === 'add') entity.add(Loaded);
        else entity.upsert(Loaded, undefined);
      }).not.toThrow();
      expect(Asset.current(entity)).toBe(Pending);
      expect(entity.get(Pending)).toEqual({ attempts: 3 });
      expect(entity.has(Loaded)).toBe(false);
      expect(changed).not.toHaveBeenCalled();

      if (operation === 'add') {
        entity.add(Pending({ attempts: 9 }));
        expect(entity.get(Pending)).toEqual({ attempts: 3 });
        entity.add(Loading({ progress: 0.5 }));
      } else {
        entity.upsert(Pending, { attempts: 9 });
        expect(entity.get(Pending)).toEqual({ attempts: 9 });
        entity.upsert(Loading, { progress: 0.5 });
      }
      expect(Asset.current(entity)).toBe(Loading);
      expect(entity.get(Loading)).toEqual({ progress: 0.5 });
      expect(changed).toHaveBeenCalledTimes(2);

      entity.remove(Asset);
      if (operation === 'add') entity.add(Loaded);
      else entity.upsert(Loaded, undefined);
      expect(Asset.current(entity)).toBe(Loaded);
    } finally {
      world.destroy();
    }
  }
);

it('enforces transitions before changing state or notifying listeners with assertions disabled', () => {
  const Pending = trait({ attempts: 0 });
  const Loading = trait({ progress: 0 });
  const Loaded = trait();
  const Asset = machine({
    states: { Pending, Loading, Loaded },
    initial: Pending,
    transitions: { Pending: [Loading], Loading: [Loading, Loaded] },
  });
  const world = createWorld();
  try {
    const entity = world.spawn(Pending({ attempts: 3 }));
    const changed = vi.fn();
    entity.onRemove(Pending, changed);
    entity.onAdd(Loaded, changed);
    entity.onTransition(Asset, changed);

    expect(() => Asset.enter(entity, Loaded)).not.toThrow();
    expect(() => Asset.enter(entity, Pending({ attempts: 9 }))).not.toThrow();
    expect(Asset.current(entity)).toBe(Pending);
    expect(entity.get(Pending)).toEqual({ attempts: 3 });
    expect(entity.has(Loaded)).toBe(false);
    expect(changed).not.toHaveBeenCalled();

    Asset.enter(entity, Loading({ progress: 0.5 }));
    Asset.enter(entity, Loading);
    expect(entity.get(Loading)).toEqual({ progress: 0 });
    Asset.enter(entity, Loaded);
    changed.mockClear();
    expect(() => Asset.enter(entity, Loading)).not.toThrow();
    expect(Asset.current(entity)).toBe(Loaded);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    world.destroy();
  }
});
