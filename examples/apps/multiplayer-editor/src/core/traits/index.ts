import { trait } from 'koota';
import type { Op } from '../ops/types';
import type { Entity } from 'koota';

// Singletons
export const Time = trait({ last: 0, delta: 0 });
export const Pointer = trait({ x: 0, y: 0 });
export const History = trait(() => ({
    undoStack: [] as Op[][],
    redoStack: [] as Op[][],
    pending: [] as Op[],
    nextSeq: 1, // Sequence number counter
    nextId: 1, // Stable entity ID counter
    idBase: 0, // Assigned by server for uniqueness
    entities: new Map<number, Entity>(), // Map from stable ID to current Entity handle
}));

// Shape data
export const StableId = trait({ id: 0 });
export const Shape = trait({ type: 'rect' as 'rect' | 'ellipse' });
export const Position = trait({ x: 0, y: 0 });
export const Rotation = trait({ angle: 0 }); // degrees
export const Scale = trait({ x: 1, y: 1 });
export const Color = trait({ fill: '#4a90d9' });

// Interaction
export const IsSelected = trait(); // Tag
export const Dragging = trait({ offsetX: 0, offsetY: 0 });
export const Ref = trait(() => null! as HTMLDivElement);
