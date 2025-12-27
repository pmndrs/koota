import { Position } from '@sim/boids';
import type { World } from 'koota';
import * as THREE from 'three';
import { InstancedMesh } from '../traits/InstancedMesh';

const dummy = new THREE.Object3D();
const dummyColor = new THREE.Color();

export const syncThreeObjects = ({ world }: { world: World }) => {
	const instanceEnt = world.queryFirst(InstancedMesh);
	if (instanceEnt === undefined) return;

	const instancedMesh = instanceEnt.get(InstancedMesh)!.object;

	world.query(Position).updateEach(([position], entity) => {
		dummy.position.set(position.x, position.y, 0);
		dummy.scale.set(1, 1, 1);

		dummy.updateMatrix();
		instancedMesh.setMatrixAt(entity.id(), dummy.matrix);

		dummyColor.setRGB(0.5, 0.5, 0.5);
		instancedMesh.setColorAt(entity.id(), dummyColor);
	});

	instancedMesh.instanceMatrix.needsUpdate = true;
	instancedMesh.instanceColor!.needsUpdate = true;
};
