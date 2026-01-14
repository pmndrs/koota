import type { World } from 'koota';
import * as THREE from 'three';
import { Input, IsPlayer, Movement, Time, Transform } from '../traits';

const UP = new THREE.Vector3(0, 1, 0);
const tmpvec3 = new THREE.Vector3();

export function applyInput(world: World) {
    const { delta } = world.get(Time)!;
    world
        .query(IsPlayer, Input, Transform, Movement)
        .updateEach(([input, transform, { velocity, thrust }]) => {
            velocity.add(tmpvec3.set(input.x, input.y, 0).multiplyScalar(thrust * delta * 100));
            transform.quaternion.setFromUnitVectors(UP, velocity.clone().normalize());
        });
}
