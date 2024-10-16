import { createActions } from 'koota/react';
import { Neighbors, Position, Velocity } from './traits';
import * as THREE from 'three';

export const useActions = createActions((world) => ({
	spawnBoid: (position: THREE.Vector3, velocity: THREE.Vector3) => {
		world.spawn(Position({ value: position }), Velocity({ value: velocity }), Neighbors);
	},
	destroyAllBoids: () => {
		world.query(Position, Velocity, Neighbors).forEach((entity) => {
			entity.destroy();
		});
	},
}));
