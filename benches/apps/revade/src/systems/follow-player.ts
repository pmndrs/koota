import { type World } from 'koota';
import * as THREE from 'three';
import { IsEnemy, Movement, Targeting, Transform } from '../traits';

const acceleration = new THREE.Vector3();

export function followPlayer(world: World) {
	world
		.query(IsEnemy, Transform, Movement, Targeting('*'))
		.updateEach(([transform, { velocity, thrust, damping }], entity) => {
			// Get the target from the Targeting relation
			const targets = entity.targetsFor(Targeting);
			const target = targets[0];
			if (!target || typeof target === 'string' || !target.has(Transform)) return;

			const targetTransform = target.get(Transform)!;

			// Apply damping to current velocity
			velocity.multiplyScalar(damping);

			// Calculate and apply acceleration towards target
			acceleration
				.copy(targetTransform.position)
				.sub(transform.position)
				.normalize()
				.multiplyScalar(thrust);

			velocity.add(acceleration);
		});
}
