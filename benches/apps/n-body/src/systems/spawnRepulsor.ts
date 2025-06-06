import { Acceleration, Circle, Color, Mass, Position, Repulse, Velocity, world } from '@sim/n-body';

let lastSpawnTime = 0;
const spawnInterval = 100; // milliseconds

export function spawnRepulsor(e: PointerEvent, frustumSize: number) {
	const now = performance.now();
	if (now - lastSpawnTime < spawnInterval) return;

	lastSpawnTime = now;

	const aspect = window.innerWidth / window.innerHeight;
	const viewWidth = frustumSize * aspect;
	const viewHeight = frustumSize;

	const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
	const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;

	const x = (ndcX * viewWidth) / 2;
	const y = (ndcY * viewHeight) / 2;

	world.spawn(
		Position({ x, y }),
		Circle({ radius: 160 }),
		Color({ r: 255, g: 0, b: 0 }),
		Repulse({ force: 5, decay: 0.96, delay: 1 }),
		Velocity,
		Acceleration,
		Mass({ value: 200 })
	);
}
