import { Position, Repulse } from '@sim/n-body/src/components';
import { createRemoved } from 'koota';
import * as THREE from 'three';
import { InstancedMesh } from '../components/InstancedMesh';

const Removed = createRemoved();
const zeroScaleMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export function cleanupBodies({ world }: { world: Koota.World }) {
	const instanceEntity = world.queryFirst(InstancedMesh);
	if (instanceEntity === undefined) return;

	const instancedMesh = instanceEntity.get(InstancedMesh)!.object;

	world.query(Removed(Repulse, Position)).forEach((e) => {
		instancedMesh.setMatrixAt(e.id(), zeroScaleMatrix);
	});

	instancedMesh.instanceMatrix.needsUpdate = true;
}
