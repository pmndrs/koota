import { World } from 'koota';
import { Time, Position, Velocity } from '../trait';

export const moveBodies = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);

	world.query(Position, Velocity).updateEach(
		([position, velocity]) => {
			position.x += velocity.x * delta;
			position.y += velocity.y * delta;
		},
		{ passive: true }
	);
};
