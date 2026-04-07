import { createActions, trait, universe, type Entity } from '@koota/core';
import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import ActionsTest from './components/ActionsTest.svelte';

const Position = trait({ x: 0, y: 0 });

describe('useActions', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('returns actions bound to the world in context', () => {
        const actions = createActions((world) => ({
            spawnBody: () => world.spawn(Position),
        }));

        let spawnedEntity: Entity | undefined;

        render(ActionsTest, {
            props: {
                actions,
                onActions: (boundActions: Record<string, any>) => {
                    spawnedEntity = boundActions.spawnBody();
                },
            },
        });

        expect(spawnedEntity).toBeDefined();
    });
});
