import type { World } from 'koota';
import { IsDying } from '../traits';

export function destroyDying(world: World) {
  world.query(IsDying).forEach((entity) => entity.destroy());
}
