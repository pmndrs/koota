import type { World } from 'koota';
import { repeat } from 'math';
import { Clock } from '../game/traits';
import { Position, Velocity } from '../transform/traits';
import { IsRain } from './traits';

// Recycling a drop's position keeps its identity and composition stable.
export function moveRain(world: World) {
  const { delta } = world.get(Clock)!;
  const particles = world.query(IsRain, Position, Velocity);
  particles.updateEach(
    ([position, velocity]) => {
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;
      position.z += velocity.z * delta;
      position.x = repeat(position.x + 27, 54) - 27;
      position.z = repeat(position.z + 12, 24) - 12;
      if (position.y < 0.25) position.y += 16;
    },
    { changeDetection: 'never' }
  );
  return particles.length;
}
