import { relation, trait, universe, type Entity, type TraitRecord, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import HasTest from './components/HasTest.svelte';
import TagTest from './components/TagTest.svelte';
import TraitEffectTest from './components/TraitEffectTest.svelte';
import TraitTest from './components/TraitTest.svelte';

const Position = trait({ x: 0, y: 0 });
const IsTagged = trait();

describe('useTrait', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('reactively returns the trait value for an entity', async () => {
        let entity: Entity = null!;

        const { getByTestId } = render(TraitTest, {
            props: {
                target: () => entity,
                trait: () => Position,
                onWorld: (w: World) => {
                    entity = w.spawn(Position);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

        entity.set(Position, { x: 1, y: 1 });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));
    });

    it('works with a world', async () => {
        let world: World = null!;
        const TimeOfDay = trait({ hour: 0 });

        const { getByTestId } = render(TraitTest, {
            props: {
                target: () => world,
                trait: () => TimeOfDay,
                onWorld: (w: World) => {
                    world = w;
                    w.add(TimeOfDay);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ hour: 0 }));

        world.set(TimeOfDay, { hour: 1 });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ hour: 1 }));
    });

    it('returns undefined when the target is undefined', async () => {
        const { getByTestId } = render(TraitTest, {
            props: {
                target: () => undefined,
                trait: () => Position,
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });

    it('returns undefined when the target becomes undefined', async () => {
        let entity: Entity | undefined;

        const { getByTestId, rerender } = render(TraitTest, {
            props: {
                target: () => entity,
                trait: () => Position,
                onWorld: (w: World) => {
                    entity = w.spawn(Position);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

        entity = undefined;
        await rerender({ target: () => undefined, trait: () => Position });
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });

    it('reactively updates when the world is reset', async () => {
        let world: World = null!;
        let entity: Entity = null!;

        const { getByTestId } = render(TraitTest, {
            props: {
                target: () => entity,
                trait: () => Position,
                onWorld: (w: World) => {
                    world = w;
                    entity = w.spawn(Position);
                },
            },
        });

        await tick();
        entity.set(Position, { x: 1, y: 1 });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));

        world.reset();
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });

    it('re-renders when entity.changed() is called on an AoS trait', async () => {
        class Counter {
            value = 0;
            increment() {
                this.value++;
            }
        }
        const CounterTrait = trait(() => new Counter());
        let entity: Entity = null!;

        const { getByTestId } = render(TraitTest, {
            props: {
                target: () => entity,
                trait: () => CounterTrait,
                onWorld: (w: World) => {
                    entity = w.spawn(CounterTrait);
                },
            },
        });

        await tick();
        const initial = getByTestId('value').textContent;

        entity.get(CounterTrait).increment();
        entity.changed(CounterTrait);
        await tick();

        const updated = getByTestId('value').textContent;
        expect(updated).not.toBe(initial);
    });

    it('immediately reflects the new entity value when switching entities', async () => {
        let entityA: Entity = null!;
        let entityB: Entity = null!;

        const { getByTestId, rerender } = render(TraitTest, {
            props: {
                target: () => entityA,
                trait: () => Position,
                onWorld: (w: World) => {
                    entityA = w.spawn(Position({ x: 1, y: 1 }));
                    entityB = w.spawn(Position({ x: 99, y: 99 }));
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));

        await rerender({ target: () => entityB, trait: () => Position });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 99, y: 99 }));
    });

    it('reactively returns relation pair store data', async () => {
        const ChildOf = relation({ store: { order: 0 } });
        let parentA: Entity = null!;
        let parentB: Entity = null!;
        let child: Entity = null!;

        const { getByTestId } = render(TraitTest, {
            props: {
                target: () => child,
                trait: () => ChildOf(parentA),
                onWorld: (w: World) => {
                    parentA = w.spawn();
                    parentB = w.spawn();
                    child = w.spawn();
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');

        child.add(ChildOf(parentB, { order: 10 }));
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');

        child.add(ChildOf(parentA, { order: 1 }));
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 1 }));

        child.set(ChildOf(parentA), { order: 2 });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 2 }));

        child.remove(ChildOf(parentA));
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });
});

describe('useTag', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('reactively returns a boolean for a trait', async () => {
        let entity: Entity = null!;

        const { getByTestId } = render(TagTest, {
            props: {
                target: () => entity,
                tag: IsTagged,
                onWorld: (w: World) => {
                    entity = w.spawn(IsTagged);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        entity.remove(IsTagged);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('returns false when the target becomes undefined', async () => {
        let entity: Entity | undefined;

        const { getByTestId, rerender } = render(TagTest, {
            props: {
                target: () => entity,
                tag: IsTagged,
                onWorld: (w: World) => {
                    entity = w.spawn(IsTagged);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        entity = undefined;
        await rerender({ target: () => undefined, tag: IsTagged });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('works with a world', async () => {
        let world: World = null!;
        const IsPaused = trait();

        const { getByTestId } = render(TagTest, {
            props: {
                target: () => world,
                tag: IsPaused,
                onWorld: (w: World) => {
                    world = w;
                    w.add(IsPaused);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        world.remove(IsPaused);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('immediately reflects the correct value when switching entities', async () => {
        let entityA: Entity = null!;
        let entityB: Entity = null!;

        const { getByTestId, rerender } = render(TagTest, {
            props: {
                target: () => entityA,
                tag: IsTagged,
                onWorld: (w: World) => {
                    entityA = w.spawn(IsTagged);
                    entityB = w.spawn(); // No tag
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        await rerender({ target: () => entityB, tag: IsTagged });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });
});

describe('useHas', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('reactively returns a boolean for any trait', async () => {
        let entity: Entity = null!;

        const { getByTestId } = render(HasTest, {
            props: {
                target: () => entity,
                trait: Position,
                onWorld: (w: World) => {
                    entity = w.spawn(Position);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        entity.remove(Position);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('returns false when the target becomes undefined', async () => {
        let entity: Entity | undefined;

        const { getByTestId, rerender } = render(HasTest, {
            props: {
                target: () => entity,
                trait: Position,
                onWorld: (w: World) => {
                    entity = w.spawn(Position);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        entity = undefined;
        await rerender({ target: () => undefined, trait: Position });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('works with a world', async () => {
        let world: World = null!;
        const TimeOfDay = trait({ hour: 0 });

        const { getByTestId } = render(HasTest, {
            props: {
                target: () => world,
                trait: TimeOfDay,
                onWorld: (w: World) => {
                    world = w;
                    w.add(TimeOfDay);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        world.remove(TimeOfDay);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('immediately reflects the correct value when switching entities', async () => {
        let entityA: Entity = null!;
        let entityB: Entity = null!;

        const { getByTestId, rerender } = render(HasTest, {
            props: {
                target: () => entityA,
                trait: Position,
                onWorld: (w: World) => {
                    entityA = w.spawn(Position);
                    entityB = w.spawn(); // No Position
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        await rerender({ target: () => entityB, trait: Position });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('supports relation pair and wildcard pair subscriptions', async () => {
        let child: Entity = null!;
        let parentA: Entity = null!;
        let parentB: Entity = null!;
        const ChildOf = relation();

        const { getByTestId } = render(HasTest, {
            props: {
                target: () => child,
                trait: ChildOf('*'),
                onWorld: (w: World) => {
                    parentA = w.spawn();
                    parentB = w.spawn();
                    child = w.spawn();
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('false');

        child.add(ChildOf(parentB));
        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        child.add(ChildOf(parentA));
        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        child.remove(ChildOf(parentA));
        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        child.remove(ChildOf(parentB));
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });
});

describe('useTraitEffect', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('reactively calls callback when trait value changes', async () => {
        let entity: Entity = null!;
        let position: TraitRecord<typeof Position> | undefined;

        render(TraitEffectTest, {
            props: {
                target: () => entity,
                trait: () => Position,
                callback: (value: TraitRecord<typeof Position> | undefined) => {
                    position = value;
                },
                onWorld: (w: World) => {
                    entity = w.spawn(Position);
                },
            },
        });

        await tick();
        expect(position).toEqual({ x: 0, y: 0 });

        entity.set(Position, { x: 1, y: 1 });
        await tick();
        expect(position).toEqual({ x: 1, y: 1 });
    });

    it('calls callback with undefined when trait is removed', async () => {
        let entity: Entity = null!;
        let position: TraitRecord<typeof Position> | undefined;

        render(TraitEffectTest, {
            props: {
                target: () => entity,
                trait: () => Position,
                callback: (value: TraitRecord<typeof Position> | undefined) => {
                    position = value;
                },
                onWorld: (w: World) => {
                    entity = w.spawn(Position);
                },
            },
        });

        await tick();
        expect(position).toEqual({ x: 0, y: 0 });

        entity.remove(Position);
        await tick();
        expect(position).toBeUndefined();
    });

    it('works with a world trait', async () => {
        let world: World = null!;
        const TimeOfDay = trait({ hour: 0 });
        let timeOfDay: TraitRecord<typeof TimeOfDay> | undefined;

        render(TraitEffectTest, {
            props: {
                target: () => world,
                trait: () => TimeOfDay,
                callback: (value: TraitRecord<typeof TimeOfDay> | undefined) => {
                    timeOfDay = value;
                },
                onWorld: (w: World) => {
                    world = w;
                    w.add(TimeOfDay);
                },
            },
        });

        await tick();
        expect(timeOfDay).toEqual({ hour: 0 });

        world.set(TimeOfDay, { hour: 1 });
        await tick();
        expect(timeOfDay).toEqual({ hour: 1 });
    });

    it('supports relation pair subscriptions', async () => {
        const ChildOf = relation({ store: { order: 0 } });
        let parentA: Entity = null!;
        let parentB: Entity = null!;
        let child: Entity = null!;
        const updates: Array<{ order: number } | undefined> = [];

        render(TraitEffectTest, {
            props: {
                target: () => child,
                trait: () => ChildOf(parentA),
                callback: (value: { order: number } | undefined) => {
                    updates.push(value);
                },
                onWorld: (w: World) => {
                    parentA = w.spawn();
                    parentB = w.spawn();
                    child = w.spawn();
                },
            },
        });

        await tick();
        expect(updates.at(-1)).toBeUndefined();

        child.add(ChildOf(parentB, { order: 10 }));
        await tick();
        expect(updates.at(-1)).toBeUndefined();

        child.add(ChildOf(parentA, { order: 1 }));
        await tick();
        expect(updates.at(-1)).toEqual({ order: 1 });

        child.set(ChildOf(parentA), { order: 2 });
        await tick();
        expect(updates.at(-1)).toEqual({ order: 2 });

        child.remove(ChildOf(parentA));
        await tick();
        expect(updates.at(-1)).toBeUndefined();
    });
});
