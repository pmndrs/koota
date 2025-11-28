import { createActions, TraitRecord } from 'koota';
import { Forces, Position, Velocity } from './traits';
import { between } from './utils/between';
import { randomSphericalDirection } from './utils/random-direction';

export const actions = createActions((world) => ({
	spawnBoid: (
		position: TraitRecord<typeof Position> = randomSphericalDirection(between(0, 100)),
		velocity: TraitRecord<typeof Velocity> = randomSphericalDirection()
	) => {
		world.spawn(Position(position), Velocity(velocity), Forces);
	},
	destroyRandomBoid: () => {
		const entities = world.query(Position, Velocity);
		if (entities.length) entities[Math.floor(Math.random() * entities.length)].destroy();
	},
	destroyAllBoids: () => {
		world.query(Position, Velocity).forEach((entity) => {
			entity.destroy();
		});
	},
}));
