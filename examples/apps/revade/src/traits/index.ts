import { Entity, relation, trait } from 'koota';
import { Euler, Quaternion, Vector2, Vector3, type Object3D } from 'three';
import { SpatialHashMap as SpatialHashMapImpl } from '../utils/spatial-hash';

export const Time = trait({ last: 0, delta: 0 });
export const Ref = trait(() => null! as Object3D);
export const Keyboard = trait(() => new Set<string>());
export const EnemySpawner = trait({
    interval: 1,
    accumulatedTime: 0,
    max: 50,
});

export const Input = trait(() => new Vector2());

export const AutoRotate = trait({ speed: 1 });

export const Avoidance = trait({
    neighbors: () => [] as Entity[],
    range: 1.5,
});

export const Bullet = trait({
    speed: 60,
    direction: () => new Vector3(),
    lifetime: 2,
    timeAlive: 0,
});

export const Explosion = trait({
    duration: 500,
    current: 0,
    count: 12,
    velocities: () => [] as Vector3[],
});

export const Movement = trait({
    velocity: () => new Vector3(),
    force: () => new Vector3(),
    thrust: 1,
    maxSpeed: 10,
    damping: 0.9,
});

export const Transform = trait({
    position: () => new Vector3(),
    rotation: () => new Euler(),
    quaternion: () => new Quaternion(),
});

export const IsEnemy = trait();
export const IsPlayer = trait();

export const IsShieldVisible = trait();
export const ShieldVisibility = trait({ duration: 1400, current: 0 });

export const FiredBy = relation({ autoRemoveTarget: true });
export const Targeting = relation({ exclusive: true });

export const SpatialHashMap = trait(() => new SpatialHashMapImpl(50));
