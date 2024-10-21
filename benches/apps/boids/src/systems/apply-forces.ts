import { World } from 'koota';
import { Forces, Time, Velocity } from '../traits';

export const applyForces = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);

	world.query(Forces, Velocity).updateEach(([forces, velocity]) => {
		velocity.addScaledVector(forces.coherence, delta);
		velocity.addScaledVector(forces.separation, delta);
		velocity.addScaledVector(forces.alignment, delta);
		velocity.addScaledVector(forces.avoidEdges, delta);
	});
};
