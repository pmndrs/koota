import { trait } from 'koota';
import { Euler, Vector3, type Object3D } from 'three';

// World traits
export const Time = trait({ delta: 0, current: 0 });

// Entity traits
export const ShapeId = trait({ id: '' });

export const Transform = trait({
	position: () => new Vector3(),
	rotation: () => new Euler(),
	scale: () => new Vector3(1, 1, 1),
});

export type ShapeKind = 'box' | 'sphere' | 'cylinder';

export const ShapeType = trait({ type: 'box' as ShapeKind });

export const ShapeColor = trait({ color: '#4488ff' });

export const Selected = trait();

export const Ref = trait(() => null as Object3D | null);
