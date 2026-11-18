import type { World } from 'koota';
import { Explosion, IsDying, IsEnemy, Transform } from '../traits';
import { between } from '../utils/between';

export function explodeDyingEnemies(world: World) {
  world.query(IsDying, IsEnemy, Transform).each(({ position }) => {
    world.spawn(
      Explosion({ count: Math.floor(between(12, 20)) }),
      Transform({ position: position.clone() })
    );
  });
}
