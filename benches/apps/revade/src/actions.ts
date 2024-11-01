import { TraitValue } from 'koota';
import { createActions } from 'koota/react';
import {
	AutoRotate,
	Avoidance,
	Bullet,
	Input,
	IsEnemy,
	IsPlayer,
	Movement,
	Transform,
} from './traits';
import * as THREE from 'three';

type TransformValue = TraitValue<(typeof Transform)['schema']>;

export const useActions = createActions((world) => ({
	spawnPlayer: (transform?: TransformValue) => {
		return world.spawn(IsPlayer, Movement, Input, Transform(transform));
	},
	spawnEnemy: (transform?: TransformValue) => {
		return world.spawn(
			IsEnemy,
			Movement({ thrust: 0.5, damping: 0.98 }),
			Transform(transform),
			AutoRotate,
			Avoidance
		);
	},
	spawnBullet: (position: THREE.Vector3, rotation: THREE.Quaternion) => {
		const direction = new THREE.Vector3(0, 1, 0);
		direction.applyQuaternion(rotation);

		return world.spawn(
			Transform({ position: position.clone(), quaternion: rotation.clone() }),
			Bullet({ direction })
		);
	},
}));
