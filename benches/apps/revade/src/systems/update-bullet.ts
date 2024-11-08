import {createAdded, World } from 'koota';
import * as THREE from 'three';
import {Bullet, Movement, Time, Transform} from '../traits';

const tmpVec3 = new THREE.Vector3();
const Added = createAdded()

export const updateBullets = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);

	world.query(Added(Bullet), Movement).updateEach(([bullet, movement]) => {
		//movement.force.copy(tmpVec3.copy(bullet.direction).multiplyScalar(bullet.speed * delta));
	});


	world.query(Bullet, Transform, Movement).updateEach(([bullet, transform, movement], entity) => {
		// Update bullet position
		movement.force.copy(tmpVec3.copy(bullet.direction).multiplyScalar(bullet.speed * delta * 100))
		//transform.position.add(tmpVec3.copy(bullet.direction).multiplyScalar(bullet.speed * delta));

		// Update lifetime
		bullet.timeAlive += delta;
		if (bullet.timeAlive >= bullet.lifetime) {
			entity.destroy();
			return;
		}
	});
};
