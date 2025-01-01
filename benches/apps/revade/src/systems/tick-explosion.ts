import { World } from 'koota';
import { Explosion, Time } from '../traits';

export const tickExplosion = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;
	world.query(Explosion).updateEach(([explosion], entity) => {
		explosion.current += delta * 1000;
		if (explosion.current >= explosion.duration) {
			entity.destroy();
		}
	});
};
