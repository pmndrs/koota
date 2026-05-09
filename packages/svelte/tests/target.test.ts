import { createWorld, relation, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import TargetTest from './components/TargetTest.svelte';
import TargetsTest from './components/TargetsTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

const Marker = trait();

describe('useTarget', () => {
    let world = createWorld();

    const renderSubject = (props: any) => {
        return render(TargetTest, {
            context: new Map([[WORLD_KEY, world]]),
            props,
        });
    };

    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively returns the target for an entity relation', async () => {
        const Parent = relation({ exclusive: true });
        const subject = world.spawn(Marker);
        const targetA = world.spawn(Marker);
        const targetB = world.spawn(Marker);

        const { getByTestId } = renderSubject({
            target: subject,
            relation: Parent,
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
        const entityA = world.spawn();
        const entityB = world.spawn();
        const targetForA = world.spawn();
        entityA.add(Parent(targetForA));

        const { getByTestId, rerender } = renderSubject({
            target: entityA,
            relation: Parent,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe(String(targetForA));

        await rerender({ target: entityB, relation: Parent });
        await tick();
        expect(getByTestId('value').textContent).toBe('undefined');
    });
});

describe('useTargets', () => {
    let world = createWorld();

    const renderSubject = (props: any) => {
        return render(TargetsTest, {
            context: new Map([[WORLD_KEY, world]]),
            props,
        });
    };

    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively returns targets for an entity relation', async () => {
        const Likes = relation();
        const subject = world.spawn(Marker);
        const targetA = world.spawn(Marker);
        const targetB = world.spawn(Marker);

        const { getByTestId } = renderSubject({
            target: subject,
            relation: Likes,
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
