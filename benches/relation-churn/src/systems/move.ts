import type { World } from 'koota';
import { Position, Velocity } from '../traits';

export const move = ({ world }: { world: World }) => {
	world.query(Position, Velocity).updateEach(([position, velocity]) => {
		position.x += velocity.x;
		position.y += velocity.y;
		position.z += velocity.z;
	});
};
