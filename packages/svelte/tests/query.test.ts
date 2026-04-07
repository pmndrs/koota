import { createWorld, relation, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import QueryTest from './components/QueryTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Position = trait({ x: 0, y: 0 });

describe('useQuery', () => {
    let world = createWorld();

    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    const renderSubject = (props: any) => {
        return render(QueryTest, {
            props,
            context: new Map([[WORLD_KEY, world]]),
        });
    };

    it('reactively returns entities matching the query', async () => {
        const { getByTestId } = renderSubject({
            params: [Position],
        });

        await tick();
        expect(getByTestId('count').textContent).toBe('0');

        world.spawn(Position);
        await tick();
        expect(getByTestId('count').textContent).toBe('1');

        const entityToDestroy = world.spawn(Position);
        await tick();
        expect(getByTestId('count').textContent).toBe('2');

        entityToDestroy.destroy();
        await tick();
        expect(getByTestId('count').textContent).toBe('1');
    });

    it('reactively updates when the world is reset', async () => {
        const { getByTestId } = renderSubject({
            params: [Position],
        });

        await tick();
        expect(getByTestId('count').textContent).toBe('0');

        world.spawn(Position);
        world.spawn(Position);
        await tick();
        expect(getByTestId('count').textContent).toBe('2');

        world.reset();
        await tick();
        expect(getByTestId('count').textContent).toBe('0');

        world.spawn(Position);
        await tick();
        expect(getByTestId('count').textContent).toBe('1');
    });

    it('should define special methods on query result', async () => {
        const { getByTestId } = renderSubject({
            params: [],
        });

        await tick();
        expect(getByTestId('has-update-each').textContent).toBe('true');
    });

    it('should handle relation query when target entity changes', async () => {
        const ChildOf = relation();
        const Tag = trait();

        const parent1 = world.spawn(Tag);
        const parent2 = world.spawn(Tag);

        // Two children of parent1
        world.spawn(Tag, ChildOf(parent1));
        world.spawn(Tag, ChildOf(parent1));

        // One child of parent2
        world.spawn(Tag, ChildOf(parent2));

        const { getByTestId, rerender } = renderSubject({
            params: [Tag, ChildOf(parent1)],
        });

        await tick();
        expect(getByTestId('count').textContent).toBe('2');

        // Change parent - the query should update to reflect children of parent2
        await rerender({ params: [Tag, ChildOf(parent2)] });
        await tick();
        expect(getByTestId('count').textContent).toBe('1');
    });
});
