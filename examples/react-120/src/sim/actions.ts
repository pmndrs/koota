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
    const velocity = entity.get(ScaleSpring)?.velocity ?? 0;
    entity.upsert(ScaleSpring, { velocity: velocity + (options.strength ?? 0.25) });
  },
}));
