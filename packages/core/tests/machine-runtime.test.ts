import { afterAll, expect, it, vi } from 'vitest';
import { createWorld, machine, trait } from '../src';

vi.hoisted(() => {
  vi.stubGlobal('__KOOTA_ASSERTS__', false);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it.each(['enter', 'add', 'upsert'] as const)(
  'enforces transitions through %s with assertions disabled',
  (operation) => {
    const Pending = trait({ attempts: 0 });
    const Loading = trait({ attempts: 0 });
    const Loaded = trait({ attempts: 0 });
    const Asset = machine({
      states: { Pending, Loading, Loaded },
      initial: Pending,
      transitions: { Pending: [Loading], Loading: [Loaded] },
    });
    const world = createWorld();
    try {
      const entity = world.spawn(Pending({ attempts: 3 }));
      const transition = (state: typeof Pending) => {
        if (operation === 'enter') Asset.enter(entity, state({ attempts: 9 }));
        else if (operation === 'add') entity.add(state({ attempts: 9 }));
        else entity.upsert(state, { attempts: 9 });
      };
      const changed = vi.fn();
      entity.onRemove(Pending, changed);
      entity.onAdd(Loaded, changed);
      entity.onTransition(Asset, changed);

      transition(Loaded);
      if (operation === 'enter') transition(Pending);
      expect(Asset.current(entity)).toBe(Pending);
      expect(entity.get(Pending)).toEqual({ attempts: 3 });
      expect(entity.has(Loaded)).toBe(false);
      expect(changed).not.toHaveBeenCalled();

      transition(Loading);
      expect(Asset.current(entity)).toBe(Loading);
      expect(entity.get(Loading)).toEqual({ attempts: 9 });
    } finally {
      world.destroy();
    }
  }
);
