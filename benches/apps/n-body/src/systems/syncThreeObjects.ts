import { Circle, Color, Position } from '@sim/n-body';
import * as THREE from 'three';
import { InstancedMesh } from '../components/InstancedMesh';
import { getIndex } from 'koota';

const normalize = (x: number, min: number, max: number) => (x - min) / (max - min);

const dummy = new THREE.Object3D();
const dummyColor = new THREE.Color();

export const syncThreeObjects = ({ world }: { world: Koota.World }) => {
	const instanceEnt = world.queryFirst(InstancedMesh);
	if (instanceEnt === undefined) return;

	const instancedMesh = instanceEnt.get(InstancedMesh)!.object;

	world.query(Position, Circle, Color).updateEach(([position, circle, color], entity) => {
		const i = getIndex(entity);

		dummy.position.set(position.x, position.y, 0);

		const radius = normalize(circle.radius, 0, 60);
		dummy.scale.set(radius, radius, radius);

		dummy.updateMatrix();
		instancedMesh.setMatrixAt(i, dummy.matrix);

		dummyColor.setRGB(
			normalize(color.r, 0, 255),
			normalize(color.g, 0, 255),
			normalize(color.b, 0, 255)
		);
		instancedMesh.setColorAt(i, dummyColor);
	});

	instancedMesh.instanceMatrix.needsUpdate = true;
	instancedMesh.instanceColor!.needsUpdate = true;
};
