import { relation, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import QueryTest from './components/QueryTest.svelte';

const Position = trait({ x: 0, y: 0 });

describe('useQuery', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('reactively returns entities matching the query', async () => {
        let world: World = null!;

        const { getByTestId } = render(QueryTest, {
            props: {
                params: () => [Position],
                onWorld: (w: World) => {
                    world = w;
                },
            },
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
        let world: World = null!;

        const { getByTestId } = render(QueryTest, {
            props: {
                params: () => [Position],
                onWorld: (w: World) => {
                    world = w;
                },
            },
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
        const { getByTestId } = render(QueryTest, {
            props: {
                params: () => [],
            },
        });

        await tick();
        expect(getByTestId('has-update-each').textContent).toBe('true');
    });

    it('should handle relation query when target entity changes', async () => {
        const ChildOf = relation();
        const Tag = trait();

        let world: World = null!;
        let parent1: Entity = null!;
        let parent2: Entity = null!;

        const { getByTestId, rerender } = render(QueryTest, {
            props: {
                params: () => [Tag, ChildOf(parent1)],
                onWorld: (w: World) => {
                    world = w;
                    parent1 = w.spawn(Tag);
                    parent2 = w.spawn(Tag);
                    // Two children of parent1
                    w.spawn(Tag, ChildOf(parent1));
                    w.spawn(Tag, ChildOf(parent1));
                    // One child of parent2
                    w.spawn(Tag, ChildOf(parent2));
                },
            },
        });

        await tick();
        expect(getByTestId('count').textContent).toBe('2');

        // Change parent - the query should update to reflect children of parent2
        await rerender({ params: () => [Tag, ChildOf(parent2)] });
        await tick();
        expect(getByTestId('count').textContent).toBe('1');
    });
});
