import { createWorld, relation, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { ComponentProps, tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import HasTest from './components/HasTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

describe('useHas', () => {
    const Position = trait({ x: 0, y: 0 });
    let world = createWorld();

    const renderSubject = (props: ComponentProps<typeof HasTest>) => {
        return render(HasTest, {
            context: new Map([[WORLD_KEY, world]]),
            props,
        });
    };

    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively returns a boolean for any trait', async () => {
        const entity = world.spawn(Position);

        const { getByTestId } = renderSubject({
            target: entity,
            trait: Position,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        entity.remove(Position);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('returns false when the target becomes undefined', async () => {
        const entity = world.spawn(Position);

        const { getByTestId, rerender } = renderSubject({
            target: entity,
            trait: Position,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        await rerender({ target: undefined, trait: Position });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('works with a world', async () => {
        const TimeOfDay = trait({ hour: 0 });
        world.add(TimeOfDay);

        const { getByTestId } = renderSubject({
            target: world,
            trait: TimeOfDay,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        world.remove(TimeOfDay);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('immediately reflects the correct value when switching entities', async () => {
        const entityA = world.spawn(Position);
        const entityB = world.spawn(); // No Position

        const { getByTestId, rerender } = renderSubject({
            target: entityA,
            trait: Position,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        await rerender({ target: entityB, trait: Position });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('supports relation pair and wildcard pair subscriptions', async () => {
        const parentA = world.spawn();
        const parentB = world.spawn();
        const child = world.spawn();
        const ChildOf = relation();

        const { getByTestId } = renderSubject({
            target: child,
            trait: ChildOf('*'),
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
