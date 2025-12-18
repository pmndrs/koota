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
		const a = world.spawn(Marker);
		const b = world.spawn(Marker);

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
			subject.add(Parent(a));
		});
		expect(target).toBe(a);

		await act(async () => {
			subject.add(Parent(b));
		});
		expect(target).toBe(b);

		await act(async () => {
			subject.remove(Parent(b));
		});
		expect(target).toBeUndefined();
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
		const a = world.spawn(Marker);
		const b = world.spawn(Marker);

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
			subject.add(Likes(a));
			subject.add(Likes(b));
		});

		expect([...targets].sort()).toEqual([a, b].sort());

		await act(async () => {
			subject.remove(Likes(a));
		});

		expect(targets).toEqual([b]);
	});
});
