import type { World } from 'koota';
import { Input, Movement } from '../traits';

export function dampPlayerMovement(world: World) {
  world.query(Movement, Input).each(({ velocity, damping }, input) => {
    if (input.lengthSq() === 0) {
      velocity.multiplyScalar(damping);
    }
  });
}
