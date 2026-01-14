import { createWorld, universe, type World } from '../../dist';
import { render } from '@testing-library/react';
import { act, StrictMode, useEffect, useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorld, WorldProvider } from '../../react';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;

describe('World', () => {
    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('provides a world to its children', async () => {
        let worldTest: World | null = null;

        function Test() {
            worldTest = useWorld();
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

        expect(worldTest).toBe(world);
    });

    it('can lazy init to create a world in useMemo', () => {
        universe.reset();

        let worldTest: World = null!;

        function Test() {
            worldTest = useMemo(() => createWorld({ lazy: true }), []);

            useEffect(() => {
                worldTest.init();
                return () => worldTest.destroy();
            }, [worldTest]);

            return null;
        }

        render(
            <StrictMode>
                <Test />
            </StrictMode>
        );

        expect(worldTest).toBeDefined();
        expect(worldTest!.isInitialized).toBe(true);
        expect(universe.worlds.length).toBe(1);
    });
});
