import { createWorld, type World } from '@koota/core';
import { render } from '@testing-library/react';
import { act, StrictMode, useEffect, useMemo } from 'react';
import { describe, expect, it } from 'vitest';
import { useWorld, WorldProvider } from '../src';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('World', () => {
    it('provides a world to its children', async () => {
        const world = createWorld();
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

    it('can create a world in useMemo', () => {
        let worldTest: World = null!;

        function Test() {
            worldTest = useMemo(() => createWorld(), []);

            useEffect(() => {
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
    });
});
