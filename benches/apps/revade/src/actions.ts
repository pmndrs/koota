import { createActions, type Entity, type TraitValue } from 'koota';
import * as THREE from 'three';
import {
	AutoRotate,
	Avoidance,
	Bullet,
	FiredBy,
	Input,
	IsEnemy,
	IsPlayer,
	Movement,
	Targeting,
	Transform,
} from './traits';

type TransformValue = TraitValue<(typeof Transform)['schema']>;

export const actions = createActions((world) => ({
	spawnPlayer: (transform?: TransformValue) => {
		return world.spawn(IsPlayer, Movement, Input, Transform(transform));
	},
	spawnEnemy: (options: { transform?: TransformValue; target?: Entity }) => {
		const enemy = world.spawn(
			IsEnemy,
			Movement({ thrust: 0.5, damping: 0.98 }),
			Transform(options.transform),
			AutoRotate,
			Avoidance
		);
		if (options.target) enemy.add(Targeting(options.target));

		return enemy;
	},
	spawnBullet: (position: THREE.Vector3, rotation: THREE.Quaternion, firedBy?: Entity) => {
		const direction = new THREE.Vector3(0, 1, 0);
		direction.applyQuaternion(rotation);

		const bullet = world.spawn(
			Transform({ position: position.clone(), quaternion: rotation.clone() }),
			Bullet({ direction })
		);
		if (firedBy) bullet.add(FiredBy(firedBy));

		return bullet;
	},
}));
