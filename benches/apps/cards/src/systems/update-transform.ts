import type { World } from 'koota';
import { Dragging, Position, Rotation, Scale, Velocity } from '../traits';

export function updateTransform(world: World) {
	world
		.query(Velocity, Position, Rotation, Scale)
		.updateEach(([velocity, position, rotation, scale], entity) => {
			const isDragging = entity.has(Dragging);

			// Derive transforms from velocity
			const speedSq = velocity.x * velocity.x + velocity.y * velocity.y;
			const shouldSnapNeutral = !isDragging && speedSq < 25; // ~5px/s threshold

			position.z = isDragging ? 50 : 0;

			rotation.x = shouldSnapNeutral ? 0 : Math.max(-20, Math.min(20, -velocity.y * 0.015));
			rotation.y = shouldSnapNeutral ? 0 : Math.max(-20, Math.min(20, velocity.x * 0.015));
			rotation.z = 0;

			const s = isDragging ? 1.05 : 1.0;
			scale.x = scale.y = scale.z = s;
		});
}
