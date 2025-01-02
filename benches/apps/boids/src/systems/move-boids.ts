import { World } from 'koota';
import { BoidsConfig, Position, Time, Velocity } from '../traits';

export const moveBoids = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;
	const { maxVelocity } = world.get(BoidsConfig)!;

	world.query(Position, Velocity).updateEach(([position, velocity]) => {
		velocity.clampLength(0, maxVelocity);
		position.addScaledVector(velocity, delta);
	});
};
