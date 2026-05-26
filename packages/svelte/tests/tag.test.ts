import { createWorld, trait, universe, type Entity, type World } from '@koota/core';
import { render } from '@testing-library/svelte';
import { ComponentProps, tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import TagTest from './components/TagTest.svelte';
import { WORLD_KEY } from '../src/world/world-context';

describe('useTag', () => {
    const IsTagged = trait();
    let world = createWorld();

    const renderSubject = (props: ComponentProps<typeof TagTest>) => {
        return render(TagTest, {
            context: new Map([[WORLD_KEY, world]]),
            props,
        });
    };

    beforeEach(() => {
        universe.reset();
        world = createWorld();
    });

    it('reactively returns a boolean for a trait', async () => {
        const entity = world.spawn(IsTagged);

        const { getByTestId } = renderSubject({
            target: entity,
            tag: IsTagged,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        entity.remove(IsTagged);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('returns false when the target becomes undefined', async () => {
        let entity = world.spawn(IsTagged);

        const { getByTestId, rerender } = renderSubject({
            target: entity,
            tag: IsTagged,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        await rerender({ target: undefined, tag: IsTagged });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('works with a world', async () => {
        const IsPaused = trait();

        const { getByTestId } = renderSubject({
            target: world,
            tag: IsPaused,
        });

        world.add(IsPaused);

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        world.remove(IsPaused);
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });

    it('immediately reflects the correct value when switching entities', async () => {
        const entityA = world.spawn(IsTagged);
        const entityB = world.spawn(); // No tag

        const { getByTestId, rerender } = renderSubject({
            target: entityA,
            tag: IsTagged,
        });

        await tick();
        expect(getByTestId('value').textContent).toBe('true');

        await rerender({ target: entityB, tag: IsTagged });
        await tick();
        expect(getByTestId('value').textContent).toBe('false');
    });
});
