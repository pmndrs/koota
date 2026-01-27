import { relation, trait } from 'koota';
import type { Entity } from 'koota';
import type { HistoryEntry, Op } from '../types';

// History entry: stores both user intent and restore target

export const Time = trait({ last: 0, delta: 0 });
export const Pointer = trait({ x: 0, y: 0 });
export const History = trait(() => ({
    undoStack: [] as HistoryEntry[],
    redoStack: [] as HistoryEntry[],
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
export const IsHovering = trait(); // Tag
export const Dragging = trait({ offsetX: 0, offsetY: 0, startX: 0, startY: 0 });
export const Ref = trait(() => null! as HTMLDivElement);

export const IsCanvas = trait(); // Tag

// User entity traits
export const User = trait({ name: '' });
export const ClientId = trait({ id: '' });
export const IsLocal = trait(); // Tag - local user
export const IsRemote = trait(); // Tag - remote users

// Remote cursor (only on remote users, interpolated)
export const RemoteCursor = trait({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
});

// Remote selection (array of stable IDs selected by remote user)
export const RemoteSelection = trait(() => [] as number[]);

// Ephemeral transform - relation from Shape to User with transform preview data
// Exclusive: only one user can transform a shape at a time
// Uses target values for interpolation (like RemoteCursor)
export const RemotelyTransformedBy = relation({
    exclusive: true,
    store: {
        // Current interpolated values
        deltaX: 0,
        deltaY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        // Target values (from network)
        targetDeltaX: 0,
        targetDeltaY: 0,
        targetScaleX: 1,
        targetScaleY: 1,
        targetRotation: 0,
    },
});
