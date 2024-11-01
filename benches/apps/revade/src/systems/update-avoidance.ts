import { World } from 'koota';
import * as THREE from 'three';
import { Avoidance, Movement, SpatialHashMap, Transform } from '../traits';

const acceleration = new THREE.Vector3();

export const updateAvoidance = ({ world }: { world: World }) => {
	const spatialHashMap = world.get(SpatialHashMap);

	world
		.query(Avoidance, Transform, Movement)
		.updateEach(([avoidance, { position }, { velocity }]) => {
			spatialHashMap.getNearbyEntities(
				position.x,
				position.y,
				position.z,
				avoidance.range,
				avoidance.neighbors
			);

			avoidance.neighbors = avoidance.neighbors.filter((neighbor) => {
				return neighbor.get(Transform).position.distanceTo(position) <= avoidance.range;
			});

			if (avoidance.neighbors.length) {
				acceleration.setScalar(0);

				for (const neighbor of avoidance.neighbors) {
					acceleration.add(neighbor.get(Transform).position).sub(position);
				}

				acceleration.divideScalar(-avoidance.neighbors.length).normalize().multiplyScalar(2);
				velocity.add(acceleration);
			}
		});
};
