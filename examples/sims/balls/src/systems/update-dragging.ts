import type { World } from 'koota';
import { Dragging, Pointer, Position, Time, Velocity } from '../traits';
import { lerp } from '../utils/lerp';

const BASE_ALPHA_60 = 0.5;

export function updateDragging(world: World) {
	const pointer = world.get(Pointer);
	if (!pointer) return;

	const { delta } = world.get(Time)!;
	const alpha = 1 - Math.pow(1 - BASE_ALPHA_60, delta * 60);

	world.query(Position, Velocity, Dragging).updateEach(([position, velocity, dragging]) => {
		const oldX = position.x;
		const oldY = position.y;

		position.x = pointer.x - dragging.offset.x;
		position.y = pointer.y - dragging.offset.y;

		// Lerp velocity with position delta for smooth momentum
		const invDelta = delta > 0 ? 1 / delta : 0;
		const targetVX = (position.x - oldX) * invDelta;
		const targetVY = (position.y - oldY) * invDelta;
		velocity.x = lerp(velocity.x, targetVX, alpha);
		velocity.y = lerp(velocity.y, targetVY, alpha);
	});
}
