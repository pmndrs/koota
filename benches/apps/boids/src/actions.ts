import { createActions } from 'koota/react';
import { Forces, Neighbors, Position, Velocity } from './traits';
import * as THREE from 'three';

export const useActions = createActions((world) => ({
	spawnBoid: (position: THREE.Vector3, velocity: THREE.Vector3) => {
		world.spawn(Position({ value: position }), Velocity({ value: velocity }), Neighbors, Forces);
	},
	destroyAllBoids: () => {
		world.query(Position, Velocity, Neighbors, Forces).forEach((entity) => {
			entity.destroy();
		});
	},
}));
