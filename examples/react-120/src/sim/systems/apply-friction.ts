import { Not, type World } from 'koota';
import { Dragging, Time, Velocity } from '../traits';

const FRICTION_PER_60 = 0.95;

export function applyFriction(world: World) {
	const { delta } = world.get(Time)!;
	const decay = Math.pow(FRICTION_PER_60, delta * 60);

	world.query(Velocity, Not(Dragging)).updateEach(([velocity]) => {
		velocity.x *= decay;
		velocity.y *= decay;
	});
}
