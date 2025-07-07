import { createActions, TraitInstance } from 'koota';
import { Position, Velocity } from './traits';
import { randomSphericalDirection } from './utils/random-direction';
import { between } from './utils/between';

export const actions = createActions((world) => ({
	spawnBoid: (
		position: TraitInstance<typeof Position> = randomSphericalDirection(between(0, 100)),
		velocity: TraitInstance<typeof Velocity> = randomSphericalDirection()
	) => {
		world.spawn(Position(position), Velocity(velocity));
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
