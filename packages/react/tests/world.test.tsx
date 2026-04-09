import { createWorld, universe, type World } from '@koota/core';
import { render } from '@testing-library/react';
import { act, StrictMode, useEffect, useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorld, WorldProvider } from '../src';

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

    it('can create a world in useMemo and auto-register on first use', () => {
        universe.reset();

        let worldTest: World = null!;

        function Test() {
            worldTest = useMemo(() => createWorld(), []);

            useEffect(() => {
                worldTest.spawn();
                return () => worldTest.destroy();
            }, []); // eslint-disable-line react-hooks/exhaustive-deps

            return null;
        }

        render(
            <StrictMode>
                <Test />
            </StrictMode>
        );

        expect(worldTest).toBeDefined();
        expect(worldTest!.isRegistered).toBe(true);
    });
});
