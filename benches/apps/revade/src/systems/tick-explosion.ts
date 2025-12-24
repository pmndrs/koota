import type { World } from 'koota';
import { Explosion, Time } from '../traits';

export function tickExplosion(world: World) {
	const { delta } = world.get(Time)!;
	world.query(Explosion).updateEach(([explosion], entity) => {
		explosion.current += delta * 1000;
		if (explosion.current >= explosion.duration) {
			entity.destroy();
		}
	});
}
