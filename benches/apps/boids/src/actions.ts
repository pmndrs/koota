import { createActions } from 'koota/react';
import { Forces, Neighbors, Position, Velocity } from './traits';
import * as THREE from 'three';

export const useActions = createActions((world) => ({
	spawnBoid: (position: THREE.Vector3, velocity: THREE.Vector3) => {
		world.spawn(Position(position), Velocity(velocity), Neighbors, Forces);
	},
	destroyRandomBoid: () => {
		const entities = world.query(Position, Velocity, Neighbors, Forces);
		if (entities.length) entities[Math.floor(Math.random() * entities.length)].destroy();
	},
	destroyAllBoids: () => {
		world.query(Position, Velocity, Neighbors, Forces).forEach((entity) => {
			entity.destroy();
		});
	},
}));
