import { trait } from 'koota';

// --- World traits (singletons) ---

export const Time = trait({ current: 0, last: 0, delta: 0 });
export const EditorStatus = trait({ connected: false, canUndo: false, canRedo: false });

// --- Entity traits ---

// Network identity - stable ID for multiplayer sync
export const NetID = trait({ id: '' });

// Shape data
export const ShapeType = trait({ type: 'box' as 'box' | 'sphere' | 'cylinder' });
export const Position = trait({ x: 0, y: 0, z: 0 });
export const Rotation = trait({ x: 0, y: 0, z: 0, w: 1 }); // quaternion
export const Scale = trait({ x: 1, y: 1, z: 1 });
export const Color = trait({ value: '#4a90d9' });

// Local-only tag (convention: tags start with Is)
export const IsSelected = trait();

// Three.js object reference (local only, set by component on mount)
export const ThreeRef = trait(() => null! as THREE.Object3D);

// Remote presence (one entity per remote client)
export const Presence = trait({
	clientId: '',
	color: '',
	selectedNetId: null as string | null,
});

// Type exports for convenience
export type PositionData = { x: number; y: number; z: number };
export type RotationData = { x: number; y: number; z: number; w: number };
export type ScaleData = { x: number; y: number; z: number };
export type ShapeTypeValue = 'box' | 'sphere' | 'cylinder';

import type * as THREE from 'three';
