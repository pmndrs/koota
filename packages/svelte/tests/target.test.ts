import { relation, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import TargetTest from './components/TargetTest.svelte';
import TargetsTest from './components/TargetsTest.svelte';

const Marker = trait();

describe('useTarget', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('reactively returns the target for an entity relation', async () => {
        const Parent = relation({ exclusive: true });
        let subject: Entity = null!;
        let targetA: Entity = null!;
        let targetB: Entity = null!;

        const { getByTestId } = render(TargetTest, {
            props: {
                target: () => subject,
                relation: Parent,
                onWorld: (w: World) => {
                    subject = w.spawn(Marker);
                    targetA = w.spawn(Marker);
                    targetB = w.spawn(Marker);
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');

        subject.add(Parent(targetA));
        await tick();
        expect(getByTestId('value').textContent).toBe(String(targetA));

        subject.add(Parent(targetB));
        await tick();
        expect(getByTestId('value').textContent).toBe(String(targetB));

        subject.remove(Parent(targetB));
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });

    it('immediately reflects the correct value when switching entities', async () => {
        const Parent = relation({ exclusive: true });
        let entityA: Entity = null!;
        let entityB: Entity = null!;
        let targetForA: Entity = null!;

        const { getByTestId, rerender } = render(TargetTest, {
            props: {
                target: () => entityA,
                relation: Parent,
                onWorld: (w: World) => {
                    entityA = w.spawn();
                    entityB = w.spawn();
                    targetForA = w.spawn();
                    entityA.add(Parent(targetForA));
                },
            },
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(String(targetForA));

        await rerender({ target: () => entityB, relation: Parent });
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });
});

describe('useTargets', () => {
    beforeEach(() => {
        universe.reset();
    });

    it('reactively returns targets for an entity relation', async () => {
        const Likes = relation();
        let subject: Entity = null!;
        let targetA: Entity = null!;
        let targetB: Entity = null!;

        const { getByTestId } = render(TargetsTest, {
            props: {
                target: () => subject,
                relation: Likes,
                onWorld: (w: World) => {
                    subject = w.spawn(Marker);
                    targetA = w.spawn(Marker);
                    targetB = w.spawn(Marker);
                },
            },
        });

        await tick();
        expect(getByTestId('count').textContent).toBe('0');

        subject.add(Likes(targetA));
        subject.add(Likes(targetB));
        await tick();
        expect(getByTestId('count').textContent).toBe('2');

        subject.remove(Likes(targetA));
        await tick();
        expect(getByTestId('count').textContent).toBe('1');
    });
});
