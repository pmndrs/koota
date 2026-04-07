import {
    createWorld,
    relation,
    trait,
    universe,
    type Entity,
    type TraitRecord,
    type World,
} from '@koota/core';
import { render } from '@testing-library/svelte';
import { ComponentProps, tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import TraitEffectTest from './components/TraitEffectTest.svelte';
import TraitTest from './components/TraitTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Position = trait({ x: 0, y: 0 });

describe('useTrait', () => {
    let world = createWorld();

    const renderSubject = (props: any) => {
        return render(TraitTest, {
            context: new Map([[WORLD_KEY, world]]),
            props,
        });
    };

    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively returns the trait value for an entity', async () => {
        const entity = world.spawn(Position);

        const { getByTestId } = renderSubject({
            target: entity,
            trait: Position,
            onWorld: (w: World) => {},
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

        entity.set(Position, { x: 1, y: 1 });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));
    });

    it('works with a world', async () => {
        const TimeOfDay = trait({ hour: 0 });
        world.add(TimeOfDay);

        const { getByTestId } = renderSubject({
            target: world,
            trait: TimeOfDay,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ hour: 0 }));

        world.set(TimeOfDay, { hour: 1 });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ hour: 1 }));
    });

    it('returns undefined when the target is undefined', async () => {
        const { getByTestId } = renderSubject({
            target: undefined,
            trait: Position,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });

    it('returns undefined when the target becomes undefined', async () => {
        let entity: Entity | undefined = world.spawn(Position);

        const { getByTestId, rerender } = renderSubject({
            target: entity,
            trait: Position,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

        entity = undefined;
        await rerender({ target: undefined, trait: Position });
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });

    it('reactively updates when the world is reset', async () => {
        const entity = world.spawn(Position);

        const { getByTestId } = renderSubject({
            target: entity,
            trait: Position,
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
        const entity = world.spawn(CounterTrait);

        const { getByTestId } = renderSubject({
            target: entity,
            trait: CounterTrait,
        });

        await tick();
        const initial = getByTestId('value').textContent;

        entity.get(CounterTrait)?.increment();
        entity.changed(CounterTrait);
        await tick();

        const updated = getByTestId('value').textContent;
        expect(updated).not.toBe(initial);
    });

    it('immediately reflects the new entity value when switching entities', async () => {
        const entityA = world.spawn(Position({ x: 1, y: 1 }));
        const entityB = world.spawn(Position({ x: 99, y: 99 }));

        const { getByTestId, rerender } = renderSubject({
            target: entityA,
            trait: Position,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 1, y: 1 }));

        await rerender({ target: entityB, trait: Position });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 99, y: 99 }));
    });

    it('reactively returns relation pair store data', async () => {
        const ChildOf = relation({ store: { order: 0 } });
        const parentA = world.spawn();
        const parentB = world.spawn();
        const child = world.spawn();

        const { getByTestId } = renderSubject({
            target: child,
            trait: ChildOf(parentA),
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

    it('accepts a direct trait value', async () => {
        const entity = world.spawn(Position);

        const { getByTestId } = renderSubject({
            target: entity,
            trait: Position,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 0, y: 0 }));

        entity.set(Position, { x: 5, y: 5 });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ x: 5, y: 5 }));
    });

    it('reacts to relation pair target changes via getter', async () => {
        const ChildOf = relation({ store: { order: 0 } });
        const parentA = world.spawn();
        const parentB = world.spawn();
        const child = world.spawn();
        child.add(ChildOf(parentA, { order: 1 }));
        child.add(ChildOf(parentB, { order: 2 }));

        const { getByTestId, rerender } = renderSubject({
            target: child,
            trait: ChildOf(parentA),
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 1 }));

        // Switch the observed relation pair from parentA to parentB
        await rerender({ target: child, trait: ChildOf(parentB) });
        await tick();
        expect(getByTestId('value').textContent).toBe(JSON.stringify({ order: 2 }));
    });
});

describe('useTraitEffect', () => {
    let world = createWorld();

    const renderSubject = (props: ComponentProps<typeof TraitEffectTest>) => {
        return render(TraitEffectTest, {
            context: new Map([[WORLD_KEY, world]]),
            props,
        });
    };

    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively calls callback when trait value changes', async () => {
        let entity = world.spawn(Position);
        let position: TraitRecord<typeof Position> | undefined;

        renderSubject({
            target: entity,
            trait: Position,
            callback: (value: TraitRecord<typeof Position> | undefined) => {
                position = value;
            },
        });

        await tick();
        expect(position).toEqual({ x: 0, y: 0 });

        entity.set(Position, { x: 1, y: 1 });
        await tick();
        expect(position).toEqual({ x: 1, y: 1 });
    });

    it('calls callback with undefined when trait is removed', async () => {
        let entity = world.spawn(Position);
        let position: TraitRecord<typeof Position> | undefined;

        renderSubject({
            target: entity,
            trait: Position,
            callback: (value: TraitRecord<typeof Position> | undefined) => {
                position = value;
            },
        });

        await tick();
        expect(position).toEqual({ x: 0, y: 0 });

        entity.remove(Position);
        await tick();
        expect(position).toBeUndefined();
    });

    it('works with a world trait', async () => {
        const TimeOfDay = trait({ hour: 0 });
        let timeOfDay: TraitRecord<typeof TimeOfDay> | undefined;

        renderSubject({
            target: world,
            trait: TimeOfDay,
            callback: (value: TraitRecord<typeof TimeOfDay> | undefined) => {
                timeOfDay = value;
                world.add(TimeOfDay);
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
        const parentA = world.spawn();
        const parentB = world.spawn();
        const child = world.spawn();
        const updates: Array<{ order: number } | undefined> = [];

        renderSubject({
            target: child,
            trait: ChildOf(parentA),
            callback: (value: { order: number } | undefined) => {
                updates.push(value);
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
