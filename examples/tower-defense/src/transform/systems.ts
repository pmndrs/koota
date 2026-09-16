import type { Entity, World } from 'koota';
import { euler, mat4, quat, vec3, type Mat4 } from 'math';
import { Children, IsTransformRoot, LocalMatrix, LocalTransform, WorldMatrix } from './traits';

export function composeLocalMatrices(world: World) {
  const position = vec3.create();
  const rotation = quat.create();
  const angles = euler.create();
  const nodes = world.query(LocalTransform, LocalMatrix);
  nodes.readEach(([local, matrix]) => {
    // Most attachment nodes only yaw, so they do not need a quaternion conversion.
    if (local.pitch === 0 && local.roll === 0) {
      mat4.fromYRotation(matrix, local.yaw);
      matrix[12] = local.x;
      matrix[13] = local.y;
      matrix[14] = local.z;
      return;
    }
    vec3.set(position, local.x, local.y, local.z);
    euler.set(angles, local.pitch, local.yaw, local.roll, 'yxz');
    quat.fromEuler(rotation, angles);
    mat4.fromRotationTranslation(matrix, rotation, position);
  });
  return nodes.length;
}

export function propagateWorldTransforms(world: World) {
  let count = 0;
  const visit = (entity: Entity, parent?: Mat4) => {
    const local = entity.get(LocalMatrix)!;
    const matrix = entity.get(WorldMatrix)!;
    if (parent) mat4.multiply(matrix, parent, local);
    else mat4.copy(matrix, local);
    count++;
    for (const child of entity.get(Children)!) visit(child, matrix);
  };
  for (const root of world.query(IsTransformRoot)) visit(root);
  return count;
}
