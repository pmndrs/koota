import type { World } from 'koota';
import * as THREE from 'three';
import { Bullet, Time, Transform } from '../traits';

const tmpVec3 = new THREE.Vector3();

export function updateBullets(world: World) {
	const { delta } = world.get(Time)!;

	world.query(Bullet, Transform).updateEach(([bullet, transform], entity) => {
		// Update bullet position
		transform.position.add(tmpVec3.copy(bullet.direction).multiplyScalar(bullet.speed * delta));

		// Update lifetime
		bullet.timeAlive += delta;
		if (bullet.timeAlive >= bullet.lifetime) {
			entity.destroy();
			return;
		}
	});
}
