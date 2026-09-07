import {
  createWorld,
  relation,
  trait,
  universe,
  type Entity,
  type TraitRecord,
  type World,
} from '@koota/core';
import { render } from '@testing-library/react';
import { act, StrictMode, useEffect, useLayoutEffect, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHas, useTag, useTrait, useTraitEffect, WorldProvider } from '../src';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Position = trait({ x: 0, y: 0 });
const IsTagged = trait();

describe('useTrait', () => {
  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  it('reactively returns the trait value for an entity', async () => {
    const entity = world.spawn(Position);
    let position: TraitRecord<typeof Position> | undefined;

    function Test() {
      position = useTrait(entity, Position);
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

    expect(position).toEqual({ x: 0, y: 0 });

    await act(async () => {
      entity.set(Position, { x: 1, y: 1 });
    });

    expect(position).toEqual({ x: 1, y: 1 });
  });

  it('reactively works with an entity at effect time', async () => {
    let entity: Entity | undefined;
    let position: TraitRecord<typeof Position> | undefined;

    function Test() {
      const [, set] = useState(0);

      // Rerender to ensure the entity is not stale for useTrait
      useEffect(() => {
        entity = world.spawn(Position);
        set((v) => v + 1);
      }, []);

      position = useTrait(entity, Position);
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

    expect(position).toEqual({ x: 0, y: 0 });

    await act(async () => {
      entity!.set(Position, { x: 1, y: 1 });
    });

    expect(position).toEqual({ x: 1, y: 1 });
  });

  it('works with a world', async () => {
    const TimeOfDay = trait({ hour: 0 });
    world.add(TimeOfDay);
    let timeOfDay: TraitRecord<typeof TimeOfDay> | undefined;

    function Test() {
      timeOfDay = useTrait(world, TimeOfDay);
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

    expect(timeOfDay).toEqual({ hour: 0 });

    await act(async () => {
      world.set(TimeOfDay, { hour: 1 });
    });

    expect(timeOfDay).toEqual({ hour: 1 });
  });

  it('returns undefined when the target is undefined', async () => {
    let position: TraitRecord<typeof Position> | undefined;
    let entity: Entity | undefined;

    function Test() {
      position = useTrait(entity, Position);
      return null;
    }

    const { rerender } = render(
      <StrictMode>
        <WorldProvider world={world}>
          <Test />
        </WorldProvider>
      </StrictMode>
    );

    expect(position).toBeUndefined();

    await act(async () => {
      entity = world.spawn(Position);
      rerender(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(position).toEqual({ x: 0, y: 0 });
  });

  it('returns undefined when the target becomes undefined', async () => {
    let entity: Entity | undefined = world.spawn(Position);

    let position: TraitRecord<typeof Position> | undefined;

    function Test() {
      position = useTrait(entity, Position);
      return null;
    }

    const { rerender } = render(
      <StrictMode>
        <WorldProvider world={world}>
          <Test />
        </WorldProvider>
      </StrictMode>
    );

    expect(position).toEqual({ x: 0, y: 0 });

    await act(async () => {
      entity = undefined;
      rerender(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(position).toEqual(undefined);
  });

  it('reactively updates when the world is reset', async () => {
    const entity = world.spawn(Position);
    let position: TraitRecord<typeof Position> | undefined;

    function Test() {
      position = useTrait(entity, Position);
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

      entity.set(Position, { x: 1, y: 1 });
    });

    expect(position).toEqual({ x: 1, y: 1 });

    await act(async () => {
      world.reset();
    });

    expect(position).toBeUndefined();
  });

  it('re-renders when entity.changed() is called on an AoS trait', async () => {
    class Counter {
      value = 0;
      increment() {
        this.value++;
      }
    }
    // Set up the AoS trait
    const CounterTrait = trait(() => new Counter());
    const entity = world.spawn(CounterTrait);

    // Globals we will use for reading the values outside of React
    let renderCount = 0;
    let counter: Counter | undefined;

    // Should re-render when the entity.changed() is called on an AoS trait
    function Test() {
      renderCount++;
      counter = useTrait(entity, CounterTrait);
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

    const initialRenderCount = renderCount;
    expect(counter?.value).toBe(0);

    // Increment the counter and call entity.changed() to trigger a re-render
    await act(async () => {
      counter?.increment();
      entity.changed(CounterTrait);
    });

    expect(counter?.value).toBe(1);
    expect(renderCount).toBeGreaterThan(initialRenderCount);
  });

  it('does not spuriously re-render on mount for SoA traits', async () => {
    const entity = world.spawn(Position({ x: 10, y: 20 }));
    let renderCount = 0;

    function Test() {
      renderCount++;
      useTrait(entity, Position);
      return null;
    }

    await act(async () => {
      render(
        <WorldProvider world={world}>
          <Test />
        </WorldProvider>
      );
    });

    expect(renderCount).toBe(1);
  });

  it('does not re-render on mount for AoS writes in another world', () => {
    const AoSTrait = trait(() => ({ value: 42 }));
    const entity = world.spawn(AoSTrait);
    const otherWorld = createWorld();
    const other = otherWorld.spawn(AoSTrait);
    let renderCount = 0;

    function Test() {
      renderCount++;
      const value = useTrait(entity, AoSTrait);
      useLayoutEffect(() => other.set(AoSTrait, { value: 10 }), []);
      return <span>{value?.value}</span>;
    }

    expect(render(<Test />).container.textContent).toBe('42');
    expect(renderCount).toBe(1);
    otherWorld.destroy();
  });

  it.each([false, true])(
    'catches an atomic position changed before subscribing with strict mode %s',
    async (strict) => {
      const CameraPosition = trait(() => ({ x: 0 }));
      const entity = world.spawn(CameraPosition);
      let renders = 0;
      const tick = () => {
        world.query(CameraPosition).updateEach(([position]) => {
          position.x = 10;
        });
      };

      function System() {
        useLayoutEffect(tick, []);
        return null;
      }

      function CameraView() {
        const position = useTrait(entity, CameraPosition);
        renders++;
        return <span>{position?.x}</span>;
      }

      const scene = (
        <>
          <System />
          <CameraView />
        </>
      );
      const view = render(strict ? <StrictMode>{scene}</StrictMode> : scene);

      expect(entity.get(CameraPosition)!.x).toBe(10);
      expect(view.container.textContent).toBe('10');

      const initialRenders = renders;
      await act(async () => tick());
      expect(view.container.textContent).toBe('10');
      expect(renders).toBe(initialRenders);
    }
  );

  it.each(['set', 'silent set', 'add', 'remove'] as const)(
    'catches %s before the trait subscription attaches',
    (operation) => {
      const Atomic = trait(() => ({ x: 0 }));
      const entity = operation === 'add' ? world.spawn() : world.spawn(Atomic);

      function View() {
        const value = useTrait(entity, Atomic);
        useLayoutEffect(() => {
          switch (operation) {
            case 'set':
              entity.set(Atomic, { x: 10 });
              break;
            case 'silent set':
              entity.set(Atomic, { x: 10 }, false);
              break;
            case 'add':
              entity.add(Atomic({ x: 10 }));
              break;
            case 'remove':
              entity.remove(Atomic);
              break;
          }
        }, []);
        return <span>{value?.x ?? 'missing'}</span>;
      }

      const view = render(<View />);
      expect(view.container.textContent).toBe(operation === 'remove' ? 'missing' : '10');
    }
  );

  it('catches a nested mutation signaled before subscribing', () => {
    const Atomic = trait(() => ({ position: { x: 0 } }));
    const entity = world.spawn(Atomic);

    function View() {
      const value = useTrait(entity, Atomic);
      useLayoutEffect(() => {
        entity.get(Atomic)!.position.x = 10;
        entity.changed(Atomic);
      }, []);
      return <span>{value?.position.x}</span>;
    }

    expect(render(<View />).container.textContent).toBe('10');
  });

  it('catches relation pair writes before subscribing', () => {
    const ChildOf = relation({ store: { order: 0 } });
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    function View() {
      const value = useTrait(child, ChildOf(parent));
      useLayoutEffect(() => child.set(ChildOf(parent), { order: 10 }), []);
      return <span>{value?.order}</span>;
    }

    expect(render(<View />).container.textContent).toBe('10');
  });

  it('catches a world trait replaced by reset before subscribing', () => {
    const Atomic = trait(() => ({ x: 0 }));
    world.add(Atomic);

    function View() {
      const value = useTrait(world, Atomic);
      useLayoutEffect(() => {
        world.reset();
        world.add(Atomic({ x: 10 }));
      }, []);
      return <span>{value?.x}</span>;
    }

    expect(render(<View />).container.textContent).toBe('10');
  });

  it('immediately switches targets and ignores updates from the previous entity', async () => {
    const previous = world.spawn(Position({ x: 1 }));
    const next = world.spawn(Position({ x: 99 }));
    const positions: (number | undefined)[] = [];

    function View({ entity }: { entity: Entity }) {
      const position = useTrait(entity, Position);
      positions.push(position?.x);
      useLayoutEffect(() => {
        if (entity === next) previous.set(Position, { x: 2 });
      }, [entity]);
      return <span>{position?.x}</span>;
    }

    const view = render(
      <StrictMode>
        <View entity={previous} />
      </StrictMode>
    );
    expect(view.container.textContent).toBe('1');
    positions.length = 0;

    view.rerender(
      <StrictMode>
        <View entity={next} />
      </StrictMode>
    );
    expect(view.container.textContent).toBe('99');
    expect(positions.every((x) => x === 99)).toBe(true);

    await act(async () => {
      next.set(Position, { x: 100 });
      previous.set(Position, { x: 3 });
    });
    expect(view.container.textContent).toBe('100');
  });

  it('reactively returns relation pair store data', async () => {
    const ChildOf = relation({ store: { order: 0 } });
    const parentA = world.spawn();
    const parentB = world.spawn();
    const child = world.spawn();

    let parentAData: { order: number } | undefined;
    function Test() {
      parentAData = useTrait(child, ChildOf(parentA));
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

    expect(parentAData).toBeUndefined();

    await act(async () => {
      child.add(ChildOf(parentB, { order: 10 }));
    });
    expect(parentAData).toBeUndefined();

    await act(async () => {
      child.add(ChildOf(parentA, { order: 1 }));
    });
    expect(parentAData).toEqual({ order: 1 });

    await act(async () => {
      child.set(ChildOf(parentA), { order: 2 });
    });
    expect(parentAData).toEqual({ order: 2 });

    await act(async () => {
      child.remove(ChildOf(parentA));
    });
    expect(parentAData).toBeUndefined();
  });
});

describe('useTag', () => {
  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  it('reactively returns a boolean for a trait', async () => {
    const entity = world.spawn(IsTagged);
    let isTagged: boolean | undefined;

    function Test() {
      isTagged = useTag(entity, IsTagged);
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

    expect(isTagged).toBe(true);

    await act(async () => {
      entity.remove(IsTagged);
    });

    expect(isTagged).toBe(false);
  });

  it('returns false when the target becomes undefined', async () => {
    let entity: Entity | undefined = world.spawn(IsTagged);

    let isTagged: boolean | undefined;

    function Test() {
      isTagged = useTag(entity, IsTagged);
      return null;
    }

    const { rerender } = render(
      <StrictMode>
        <WorldProvider world={world}>
          <Test />
        </WorldProvider>
      </StrictMode>
    );

    expect(isTagged).toBe(true);

    await act(async () => {
      entity = undefined;
      rerender(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(isTagged).toBe(false);
  });

  it('works with a world', async () => {
    const IsPaused = trait();
    world.add(IsPaused);
    let isPaused: boolean | undefined;

    function Test() {
      isPaused = useTag(world, IsPaused);
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

    expect(isPaused).toBe(true);

    await act(async () => {
      world.remove(IsPaused);
    });

    expect(isPaused).toBe(false);
  });

  it('immediately reflects the correct value when switching entities', async () => {
    const entityA = world.spawn(IsTagged);
    const entityB = world.spawn(); // No tag

    let isTagged: boolean | undefined;
    const values: boolean[] = [];

    function Test({ entity }: { entity: Entity }) {
      isTagged = useTag(entity, IsTagged);
      values.push(isTagged);
      return null;
    }

    const { rerender } = render(
      <StrictMode>
        <WorldProvider world={world}>
          <Test entity={entityA} />
        </WorldProvider>
      </StrictMode>
    );

    expect(isTagged).toBe(true);
    values.length = 0;

    await act(async () => {
      rerender(
        <StrictMode>
          <WorldProvider world={world}>
            <Test entity={entityB} />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(isTagged).toBe(false);
    expect(values.every((v) => v === false)).toBe(true);
  });
});

describe('useHas', () => {
  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  it('reactively returns a boolean for any trait', async () => {
    const entity = world.spawn(Position);
    let hasPosition: boolean | undefined;

    function Test() {
      hasPosition = useHas(entity, Position);
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

    expect(hasPosition).toBe(true);

    await act(async () => {
      entity.remove(Position);
    });

    expect(hasPosition).toBe(false);
  });

  it('returns false when the target becomes undefined', async () => {
    let entity: Entity | undefined = world.spawn(Position);

    let hasPosition: boolean | undefined;

    function Test() {
      hasPosition = useHas(entity, Position);
      return null;
    }

    const { rerender } = render(
      <StrictMode>
        <WorldProvider world={world}>
          <Test />
        </WorldProvider>
      </StrictMode>
    );

    expect(hasPosition).toBe(true);

    await act(async () => {
      entity = undefined;
      rerender(
        <StrictMode>
          <WorldProvider world={world}>
            <Test />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(hasPosition).toBe(false);
  });

  it('works with a world', async () => {
    const TimeOfDay = trait({ hour: 0 });
    world.add(TimeOfDay);
    let hasTimeOfDay: boolean | undefined;

    function Test() {
      hasTimeOfDay = useHas(world, TimeOfDay);
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

    expect(hasTimeOfDay).toBe(true);

    await act(async () => {
      world.remove(TimeOfDay);
    });

    expect(hasTimeOfDay).toBe(false);
  });

  it('immediately reflects the correct value when switching entities', async () => {
    const entityA = world.spawn(Position);
    const entityB = world.spawn(); // No Position

    let hasPosition: boolean | undefined;
    const values: boolean[] = [];

    function Test({ entity }: { entity: Entity }) {
      hasPosition = useHas(entity, Position);
      values.push(hasPosition);
      return null;
    }

    const { rerender } = render(
      <StrictMode>
        <WorldProvider world={world}>
          <Test entity={entityA} />
        </WorldProvider>
      </StrictMode>
    );

    expect(hasPosition).toBe(true);
    values.length = 0;

    await act(async () => {
      rerender(
        <StrictMode>
          <WorldProvider world={world}>
            <Test entity={entityB} />
          </WorldProvider>
        </StrictMode>
      );
    });

    expect(hasPosition).toBe(false);
    expect(values.every((v) => v === false)).toBe(true);
  });

  it('supports relation pair and wildcard pair subscriptions', async () => {
    const ChildOf = relation();
    const parentA = world.spawn();
    const parentB = world.spawn();
    const child = world.spawn();

    let hasParentA: boolean | undefined;
    let hasAnyParent: boolean | undefined;

    function Test() {
      hasParentA = useHas(child, ChildOf(parentA));
      hasAnyParent = useHas(child, ChildOf('*'));
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

    expect(hasParentA).toBe(false);
    expect(hasAnyParent).toBe(false);

    await act(async () => {
      child.add(ChildOf(parentB));
    });
    expect(hasParentA).toBe(false);
    expect(hasAnyParent).toBe(true);

    await act(async () => {
      child.add(ChildOf(parentA));
    });
    expect(hasParentA).toBe(true);
    expect(hasAnyParent).toBe(true);

    await act(async () => {
      child.remove(ChildOf(parentA));
    });
    expect(hasParentA).toBe(false);
    expect(hasAnyParent).toBe(true);

    await act(async () => {
      child.remove(ChildOf(parentB));
    });
    expect(hasParentA).toBe(false);
    expect(hasAnyParent).toBe(false);
  });
});

describe('useTraitEffect', () => {
  beforeEach(() => {
    universe.reset();
    world = createWorld();
  });

  it('reactively calls callback when trait value changes', async () => {
    const entity = world.spawn(Position);
    let position: TraitRecord<typeof Position> | undefined;

    function Test() {
      useTraitEffect(entity, Position, (value: TraitRecord<typeof Position> | undefined) => {
        position = value;
      });
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

    expect(position).toEqual({ x: 0, y: 0 });

    await act(async () => {
      entity.set(Position, { x: 1, y: 1 });
    });

    expect(position).toEqual({ x: 1, y: 1 });
  });

  it('calls callback with undefined when trait is removed', async () => {
    const entity = world.spawn(Position);
    let position: TraitRecord<typeof Position> | undefined;

    function Test() {
      useTraitEffect(entity, Position, (value: TraitRecord<typeof Position> | undefined) => {
        position = value;
      });
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

    expect(position).toEqual({ x: 0, y: 0 });

    await act(async () => {
      entity.remove(Position);
    });

    expect(position).toBeUndefined();
  });

  it('works with a world trait', async () => {
    const TimeOfDay = trait({ hour: 0 });
    world.add(TimeOfDay);
    let timeOfDay: TraitRecord<typeof TimeOfDay> | undefined;

    function Test() {
      useTraitEffect(world, TimeOfDay, (value: TraitRecord<typeof TimeOfDay> | undefined) => {
        timeOfDay = value;
      });
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

    expect(timeOfDay).toEqual({ hour: 0 });

    await act(async () => {
      world.set(TimeOfDay, { hour: 1 });
    });

    expect(timeOfDay).toEqual({ hour: 1 });
  });

  it('supports relation pair subscriptions', async () => {
    const ChildOf = relation({ store: { order: 0 } });
    const parentA = world.spawn();
    const parentB = world.spawn();
    const child = world.spawn();
    const updates: Array<{ order: number } | undefined> = [];

    function Test() {
      useTraitEffect(child, ChildOf(parentA), (value) => {
        updates.push(value as { order: number } | undefined);
      });
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

    expect(updates.at(-1)).toBeUndefined();

    await act(async () => {
      child.add(ChildOf(parentB, { order: 10 }));
    });
    expect(updates.at(-1)).toBeUndefined();

    await act(async () => {
      child.add(ChildOf(parentA, { order: 1 }));
    });
    expect(updates.at(-1)).toEqual({ order: 1 });

    await act(async () => {
      child.set(ChildOf(parentA), { order: 2 });
    });
    expect(updates.at(-1)).toEqual({ order: 2 });

    await act(async () => {
      child.remove(ChildOf(parentA));
    });
    expect(updates.at(-1)).toBeUndefined();
  });
});
