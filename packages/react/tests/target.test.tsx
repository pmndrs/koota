import { createWorld, relation, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/react';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTarget, useTargets, WorldProvider } from '../src';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}

global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Marker = trait();

describe('useTarget', () => {
    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively returns the target for an entity relation', async () => {
        const Parent = relation({ exclusive: true });
        const subject = world.spawn(Marker);
        const targetA = world.spawn(Marker);
        const targetB = world.spawn(Marker);

        let target: Entity | undefined;
        function Test() {
            target = useTarget(subject, Parent);
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

        expect(target).toBeUndefined();

        await act(async () => {
            subject.add(Parent(targetA));
        });
        expect(target).toBe(targetA);

        await act(async () => {
            subject.add(Parent(targetB));
        });
        expect(target).toBe(targetB);

        await act(async () => {
            subject.remove(Parent(targetB));
        });
        expect(target).toBeUndefined();
    });

    it('immediately reflects the correct value when switching entities', async () => {
        const Parent = relation({ exclusive: true });
        const entityA = world.spawn();
        const entityB = world.spawn();
        const targetForA = world.spawn();

        entityA.add(Parent(targetForA));

        let target: Entity | undefined;
        const targets: (Entity | undefined)[] = [];

        function Test({ entity }: { entity: Entity }) {
            target = useTarget(entity, Parent);
            targets.push(target);
            return null;
        }

        const { rerender } = render(
            <StrictMode>
                <WorldProvider world={world}>
                    <Test entity={entityA} />
                </WorldProvider>
            </StrictMode>
        );

        expect(target).toBe(targetForA);
        targets.length = 0;

        await act(async () => {
            rerender(
                <StrictMode>
                    <WorldProvider world={world}>
                        <Test entity={entityB} />
                    </WorldProvider>
                </StrictMode>
            );
        });

        expect(target).toBeUndefined();
        expect(targets.every((t) => t === undefined)).toBe(true);
    });
});

describe('useTargets', () => {
    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively returns targets for an entity relation', async () => {
        const Likes = relation();
        const subject = world.spawn(Marker);
        const targetA = world.spawn(Marker);
        const targetB = world.spawn(Marker);

        let targets: Entity[] = null!;
        function Test() {
            targets = useTargets(subject, Likes);
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

        expect(targets).toEqual([]);

        await act(async () => {
            subject.add(Likes(targetA));
            subject.add(Likes(targetB));
        });

        expect([...targets].sort()).toEqual([targetA, targetB].sort());

        await act(async () => {
            subject.remove(Likes(targetA));
        });

        expect(targets).toEqual([targetB]);
    });
});
