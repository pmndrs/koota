import { World } from 'koota';
import { Position, Time, Velocity } from '../traits';

const maxVelocity = 6;

export const moveBoids = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);
	world.query(Position, Velocity).updateEach(([{ value: position }, { value: velocity }]) => {
		velocity.clampLength(0, maxVelocity);
		position.addScaledVector(velocity, delta);
	});
};
