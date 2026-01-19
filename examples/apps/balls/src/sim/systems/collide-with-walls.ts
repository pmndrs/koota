import { type World } from 'koota';
import { Ball, Position, Scale, Velocity, Wall } from '../traits';

const BOUNCE = 0.2;

export function collideWithWalls(world: World) {
	const wall = world.get(Wall);
	if (!wall) return;

	world.query(Position, Velocity, Ball).updateEach(([position, velocity, { radius }], entity) => {
		const scale = entity.get(Scale)?.value ?? 1;
		const scaledRadius = radius * scale;

		const minX = scaledRadius;
		const maxX = wall.width - scaledRadius;
		const minY = scaledRadius;
		const maxY = wall.height - scaledRadius;

		// Test the x-axis (left and right walls)
		const clampedX = Math.max(minX, Math.min(maxX, position.x));
		const outX = position.x - clampedX; // < 0: left, > 0: right, 0: inside
		if (outX !== 0 && velocity.x * outX > 0) velocity.x *= -BOUNCE;
		position.x = clampedX;

		// Test the y-axis (top and bottom walls)
		const clampedY = Math.max(minY, Math.min(maxY, position.y));
		const outY = position.y - clampedY; // < 0: top, > 0: bottom, 0: inside
		if (outY !== 0 && velocity.y * outY > 0) velocity.y *= -BOUNCE;
		position.y = clampedY;
	});
}
