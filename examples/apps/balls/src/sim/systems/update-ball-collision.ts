import type { World } from 'koota';
import { Ball, Position, Scale, Time, Velocity } from '../traits';

export function updateBallCollision(world: World) {
	const { delta } = world.get(Time)!;
	const invDelta = delta > 0 ? 1 / delta : 0;

	world.query(Position, Velocity, Ball).useStores(([position, velocity, ball], entities) => {
		for (let i = 0; i < entities.length; i++) {
			const idA = entities[i].id();

			const xA = position.x[idA];
			const yA = position.y[idA];
			const scaleA = entities[i].get(Scale)?.value ?? 1;
			const radiusA = ball.radius[idA] * scaleA;
			const massA = radiusA * radiusA * Math.PI;

			for (let j = i + 1; j < entities.length; j++) {
				const indexB = entities[j].id();

				const xB = position.x[indexB];
				const xY = position.y[indexB];
				const scaleB = entities[j].get(Scale)?.value ?? 1;
				const radiusB = ball.radius[indexB] * scaleB;

				const rsum = radiusA + radiusB;
				const dx = xA - xB;
				const dy = yA - xY;

				// AABB early-out
				if (dx > rsum || -dx > rsum || dy > rsum || -dy > rsum) continue;

				// Circle overlap check
				const distSq = dx * dx + dy * dy;
				if (distSq >= rsum * rsum) continue;

				// Penetration along the center line (mirrors reference scaling by radius sum)
				const dist = Math.sqrt(distSq) || 1;
				const penetration = dist - rsum; // negative
				const invNorm = 1 / rsum;
				const offX = dx * penetration * invNorm;
				const offY = dy * penetration * invNorm;

				// Mass-based momentum distribution (πr²)
				const massB = radiusB * radiusB * Math.PI;
				const invTotal = 1 / (massA + massB);
				const ratioA = massB * invTotal; // push A by proportion of B
				const ratioB = massA * invTotal; // push B by proportion of A

				// Convert position-like offsets to per-second velocity impulses
				velocity.x[idA] -= offX * ratioA * invDelta;
				velocity.y[idA] -= offY * ratioA * invDelta;
				velocity.x[indexB] += offX * ratioB * invDelta;
				velocity.y[indexB] += offY * ratioB * invDelta;
			}
		}
	});
}
