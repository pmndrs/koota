import { World } from 'koota';
import { useActions } from '../actions';
import { IsPlayer, Time, Transform } from '../traits';

let canShoot = true;
const SHOOT_COOLDOWN = 0.15; // seconds
let cooldownTimer = 0;

// Track spacebar state
const keys = {
	space: false,
};

window.addEventListener('keydown', (e) => {
	if (e.code === 'Space') {
		keys.space = true;
	}
});

window.addEventListener('keyup', (e) => {
	if (e.code === 'Space') {
		keys.space = false;
	}
});

export const handleShooting = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);
	const { spawnBullet } = useActions.get(world);

	// Update cooldown
	if (!canShoot) {
		cooldownTimer += delta;
		if (cooldownTimer >= SHOOT_COOLDOWN) {
			canShoot = true;
			cooldownTimer = 0;
		}
	}

	// Check for shooting input
	if (keys.space && canShoot) {
		const player = world.queryFirst(IsPlayer, Transform);
		if (player) {
			const playerTransform = player.get(Transform);
			spawnBullet(playerTransform.position, playerTransform.quaternion);
			canShoot = false;
		}
	}
};
