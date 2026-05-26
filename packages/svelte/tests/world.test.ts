import { universe, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import WorldTest from './components/WorldTest.svelte';

describe('World', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('provides a world to its children', () => {
        let worldTest: World | null = null;

        render(WorldTest, {
            props: {
                onWorld: (w: World) => {
                    worldTest = w;
                },
            },
        });

        expect(worldTest).toBeDefined();
        worldTest!.spawn();
        expect(worldTest!.isRegistered).toBe(true);
    });
});
