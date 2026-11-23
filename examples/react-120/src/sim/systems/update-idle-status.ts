import { Not, type World } from 'koota';
import { Ball, Dragging, IsIdle, Velocity } from '../traits';

const IDLE_THRESHOLD = 0.1;

export function updateIdleStatus(world: World) {
  // Add IsIdle to stopped balls
  world.query(Ball, Velocity, Not(IsIdle), Not(Dragging)).each((_ball, velocity, entity) => {
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
    if (speed < IDLE_THRESHOLD) world.add(entity, IsIdle);
  });

  // Remove IsIdle from moving balls
  world.query(Ball, Velocity, IsIdle, Not(Dragging)).each((_ball, velocity, entity) => {
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
    if (speed >= IDLE_THRESHOLD) world.remove(entity, IsIdle);
  });

  // Remove IsIdle from dragged balls
  world.query(Ball, IsIdle, Dragging).forEach((entity) => {
    world.remove(entity, IsIdle);
  });
}
