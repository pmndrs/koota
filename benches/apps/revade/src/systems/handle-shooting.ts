import { World } from 'koota';
import { useActions } from '../actions';
import {Input, IsPlayer, Time, Transform} from '../traits';

let canShoot = true;
const SHOOT_COOLDOWN = 0.1; // seconds

let cooldownTimer = 0;

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
	if (canShoot) {
		const player = world.queryFirst(IsPlayer, Transform, Input);

		if (player && player.get(Input).isFiring) {
			const playerTransform = player.get(Transform);
			spawnBullet(playerTransform.position, playerTransform.quaternion);
			canShoot = false;
		}
	}
};
