import type { World } from 'koota';
import { Forces, Time, Velocity } from '../traits';

export const applyForces = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;

	world.query(Forces, Velocity).updateEach(([forces, velocity], entity) => {
		velocity.x += forces.coherence.x * delta;
		velocity.y += forces.coherence.y * delta;
		velocity.z += forces.coherence.z * delta;

		velocity.x += forces.separation.x * delta;
		velocity.y += forces.separation.y * delta;
		velocity.z += forces.separation.z * delta;

		velocity.x += forces.alignment.x * delta;
		velocity.y += forces.alignment.y * delta;
		velocity.z += forces.alignment.z * delta;

		velocity.x += forces.avoidEdges.x * delta;
		velocity.y += forces.avoidEdges.y * delta;
		velocity.z += forces.avoidEdges.z * delta;
	});
};
