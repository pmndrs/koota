import { Entity, relation, trait, WorldSnapshot } from 'koota';
import { ObjectLoader, Euler, Quaternion, Vector2, Vector3, type Object3D } from 'three';
import {
    SerializedSpatialHashMap,
    SpatialHashMap as SpatialHashMapImpl,
} from '../utils/spatial-hash';

export const Time = trait({ last: 0, delta: 0 });
export const History = trait<() => { snapshot: WorldSnapshot; visited: number }[]>(() => []);
export const Ref = trait(() => null! as Object3D, {
    deserialize(value, current) {
        if (!current) return new ObjectLoader().parse(value);
        return current.copy(new ObjectLoader().parse(value), false);
    },
});

export const Keyboard = trait(() => new Set<string>());
export const EnemySpawner = trait({
    interval: 1,
    accumulatedTime: 0,
    max: 50,
});

export const Input = trait(() => new Vector2(), {
    serialize(value) {
        return { x: value.x, y: value.y };
    },
    deserialize(value, current) {
        if (current) {
            current.set(value.x, value.y);
            return current;
        }
        return new Vector2(value.x, value.y);
    },
});

export const AutoRotate = trait({ speed: 1 });

export const Avoidance = trait({
    neighbors: () => [] as Entity[],
    range: 1.5,
});

export const Bullet = trait(
    {
        speed: 60,
        direction: () => new Vector3(),
        lifetime: 2,
        timeAlive: 0,
    },
    {
        serialize: {
            direction: (value) => ({ x: value.x, y: value.y, z: value.z }),
        },
        deserialize: {
            direction: (value, current) => {
                if (current) {
                    return current.set(value.x, value.y, value.z);
                }
                return new Vector3(value.x, value.y, value.z);
            },
        },
    }
);

export const Explosion = trait(
    {
        duration: 500,
        current: 0,
        count: 12,
        velocities: () => [] as Vector3[],
    },
    {
        serialize: {
            velocities: (value) => value.map((v) => ({ x: v.x, y: v.y, z: v.z })),
        },
        deserialize: {
            velocities: (value, current) => {
                const velocities = value.map((v: any) => new Vector3(v.x, v.y, v.z));
                if (current) {
                    current.length = 0;
                    current.push(...velocities);
                    return current;
                }
                return velocities;
            },
        },
    }
);

export const Movement = trait(
    {
        velocity: () => new Vector3(),
        force: () => new Vector3(),
        thrust: 1,
        maxSpeed: 10,
        damping: 0.9,
    },
    {
        serialize: {
            velocity: (value) => ({ x: value.x, y: value.y, z: value.z }),
            force: (value) => ({ x: value.x, y: value.y, z: value.z }),
        },
        deserialize: {
            velocity: (value, current) => {
                if (current) return current.set(value.x, value.y, value.z);
                return new Vector3(value.x, value.y, value.z);
            },
            force: (value, current) => {
                if (current) return current.set(value.x, value.y, value.z);
                return new Vector3(value.x, value.y, value.z);
            },
        },
    }
);

// SoA
export const Transform = trait(
    {
        position: () => new Vector3(),
        rotation: () => new Euler(),
        quaternion: () => new Quaternion(),
    },
    {
        serialize: {
            position: (value) => ({ x: value.x, y: value.y, z: value.z }),
            rotation: (value) => ({
                x: value.x,
                y: value.y,
                z: value.z,
                order: value.order,
            }),
            quaternion: (value) => ({ x: value.x, y: value.y, z: value.z, w: value.w }),
        },
        deserialize: {
            position: (value, current) => {
                if (current) return current.set(value.x, value.y, value.z);
                return new Vector3(value.x, value.y, value.z);
            },
            rotation: (value, current) => {
                if (current) {
                    return current.set(value.x, value.y, value.z, value.order as any);
                }
                return new Euler(value.x, value.y, value.z, value.order as any);
            },
            quaternion: (value, current) => {
                if (current) return current.set(value.x, value.y, value.z, value.w);
                return new Quaternion(value.x, value.y, value.z, value.w);
            },
        },
    }
);

export const IsEnemy = trait();
export const IsPlayer = trait();

export const IsShieldVisible = trait();
export const ShieldVisibility = trait({ duration: 1400, current: 0 });

export const FiredBy = relation({ autoDestroy: 'orphan' });
export const Targeting = relation({ exclusive: true });

// AoS
export const SpatialHashMap = trait(
    () => new SpatialHashMapImpl(50),
    {
        serialize(value) {
            return value.serialize();
        },
        deserialize(value, current) {
            const internalDeserialzed = SpatialHashMapImpl.unserialize(value);
            if (current) return Object.assign(current, internalDeserialzed);
            const instance = new SpatialHashMapImpl(internalDeserialzed.cellSize);
            return Object.assign(instance, internalDeserialzed);
        },
    }
);