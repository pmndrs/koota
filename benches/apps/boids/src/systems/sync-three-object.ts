import * as THREE from 'three';
import { InstancedMesh } from '../traits/instanced-mesh';
import { World } from 'koota';
import { Position } from '../traits';

const dummy = new THREE.Object3D();

export const syncThreeObjects = ({ world }: { world: World }) => {
	const instanceEnt = world.queryFirst(InstancedMesh);
	if (instanceEnt === undefined) return;

	const instancedMesh = instanceEnt.get(InstancedMesh)!.object;

	world.query(Position).updateEach(([{ value: position }], entity) => {
		dummy.position.copy(position);
		dummy.scale.set(0.5, 0.5, 0.5);
		dummy.updateMatrix();
		instancedMesh.setMatrixAt(entity.id(), dummy.matrix);
	});

	instancedMesh.instanceMatrix.needsUpdate = true;
};
