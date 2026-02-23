import { createActions, type TraitRecord, type Entity } from 'koota';
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
import { between } from './utils/between';

type TransformValue = TraitRecord<typeof Transform>;

export const actions = createActions((world) => ({
    spawnPlayer: (transform?: TransformValue) => {
        return world.spawn(IsPlayer, Movement, Input, Transform(transform));
    },
    spawnEnemy: (options: { position?: [number, number, number]; target?: Entity } = {}) => {
        const enemy = world.spawn(
            IsEnemy,
            Movement({ thrust: 0.5, damping: 0.98, maxSpeed: between(5, 10) }),
            Transform,
            AutoRotate,
            Avoidance
        );

        if (options.position) {
            enemy.set(Transform, (prev) => ({
                position: prev.position.set(...options.position!),
            }));
        }

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
    destroyAllEnemies: () => {
        world.query(IsEnemy).forEach((enemy) => {
            enemy.destroy();
        });
    },
}));
