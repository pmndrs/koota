import { Circle, Color, Position } from '@sim/n-body';
import * as THREE from 'three';
import { InstancedMesh } from '../components/InstancedMesh';
import { getIndex } from 'koota';

const normalize = (x: number, min: number, max: number) => (x - min) / (max - min);

const dummy = new THREE.Object3D();
const dummyColor = new THREE.Color();

export const syncThreeObjects = ({ world }: { world: Koota.World }) => {
	const ents = world.query(Position, Circle, Color);
	const [position, circle, color] = world.get(Position, Circle, Color);

	const instanceEnt = world.query(InstancedMesh)[0];
	if (instanceEnt === undefined) return;

	const instancedMesh = world.get(InstancedMesh).object[instanceEnt];

	for (let i = 0; i < ents.length; i++) {
		const e = getIndex(ents[i]);

		dummy.position.set(position.x[e], position.y[e], 0);

		const radius = normalize(circle.radius[e], 0, 60);
		dummy.scale.set(radius, radius, radius);

		dummy.updateMatrix();

		instancedMesh.setMatrixAt(e, dummy.matrix);

		const r = normalize(color.r[e], 0, 255);
		const g = normalize(color.g[e], 0, 255);
		const b = normalize(color.b[e], 0, 255);
		dummyColor.setRGB(r, g, b);
		instancedMesh.setColorAt(e, dummyColor);
	}

	instancedMesh.instanceMatrix.needsUpdate = true;
	instancedMesh.instanceColor!.needsUpdate = true;
};
