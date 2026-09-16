import { ordered, relation, trait } from 'koota';
import { mat4 } from 'math';

export const Position = trait({ x: 0, y: 0, z: 0 });
export const Velocity = trait({ x: 0, y: 0, z: 0 });
export const LocalTransform = trait({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 });
export const LocalMatrix = trait(() => mat4.create());
export const WorldMatrix = trait(() => mat4.create());
export const IsTransformRoot = trait();
export const ChildOf = relation({ exclusive: true, autoDestroy: 'orphan' });
export const Children = ordered(ChildOf);
export const Appearance = trait({ sx: 1, sy: 1, sz: 1, color: '#ffffff' });
