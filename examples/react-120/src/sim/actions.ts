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
    const velocity = world.get(entity, ScaleSpring)?.velocity ?? 0;
    world.upsert(entity, ScaleSpring, { velocity: velocity + (options.strength ?? 0.25) });
  },
}));
