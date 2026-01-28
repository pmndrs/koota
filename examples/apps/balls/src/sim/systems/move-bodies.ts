import { Not, type World } from 'koota';
import { Dragging, Position, Time, Velocity } from '../traits';

export function moveBodies(world: World) {
	const { delta } = world.get(Time)!;

	world.query(Position, Velocity, Not(Dragging)).updateEach(([position, velocity]) => {
		position.x += velocity.x * delta;
		position.y += velocity.y * delta;
	});
}
