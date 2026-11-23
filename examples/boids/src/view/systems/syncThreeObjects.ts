import { Position } from '../../sim';
import { getEntityId, type World } from 'koota';
import * as THREE from 'three';
import { InstancedMesh } from '../traits/InstancedMesh';

const dummy = new THREE.Object3D();
const dummyColor = new THREE.Color();

export const syncThreeObjects = ({ world }: { world: World }) => {
  const instanceEnt = world.queryFirst(InstancedMesh);
  if (instanceEnt === undefined) return;

  const instancedMesh = world.get(instanceEnt, InstancedMesh)!.object;

  world.query(Position).each((position, entity) => {
    dummy.position.set(position.x, position.y, 0);
    dummy.scale.set(1, 1, 1);

    dummy.updateMatrix();
    instancedMesh.setMatrixAt(getEntityId(entity), dummy.matrix);

    dummyColor.setRGB(0.5, 0.5, 0.5);
    instancedMesh.setColorAt(getEntityId(entity), dummyColor);
  });

  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.instanceColor!.needsUpdate = true;
};
