import { createActions } from 'koota';
import type { Entity } from 'koota';
import { Ball, Position, Scale, ScaleSpring, Velocity } from './traits';

type WobbleOptions = {
	strength?: number;
};

export const actions = createActions((world) => ({
	createBall: () => {
		return world.spawn(Ball, Position, Velocity, Scale, ScaleSpring);
	},
	wobbleBall: (entity: Entity, options: WobbleOptions = {}) => {
		if (!entity.has(ScaleSpring)) entity.add(ScaleSpring);

		entity.set(ScaleSpring, (prev) => {
			const strength = options.strength ?? 0.25;
			return { ...prev, velocity: prev.velocity + strength };
		});
	},
}));
