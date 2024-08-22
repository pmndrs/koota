import { Acceleration, Circle, Color, Mass, Position, Velocity, world } from '@sim/n-body';
import { Repulse } from '@sim/n-body/src/components/Repulse';
import { camera } from '../main';

let lastSpawnTime = 0;
const spawnInterval = 100; // milliseconds

export function spawnRepulsor(e: PointerEvent) {
	const now = performance.now();
	if (now - lastSpawnTime < spawnInterval) return;

	lastSpawnTime = now;
	const frustumSize = camera.userData.frustumSize;

	const aspect = window.innerWidth / window.innerHeight;
	const viewWidth = frustumSize * aspect;
	const viewHeight = frustumSize;

	const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
	const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;

	const x = (ndcX * viewWidth) / 2;
	const y = (ndcY * viewHeight) / 2;

	world.create(
		Position({ x, y }),
		Circle({ radius: 160 }),
		Color({ r: 255, g: 0, b: 0 }),
		Repulse({ force: 5, decay: 0.96, delay: 1 }),
		Velocity,
		Acceleration,
		Mass({ value: 200 })
	);
}
