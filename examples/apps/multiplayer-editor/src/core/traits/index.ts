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
export const IsTombstoned = trait(); // Tag

// Editing state - captures durable (last committed op) values
// Target fields are used for remote interpolation (drag mode only)
export const EditingPosition = trait({ durableX: 0, durableY: 0, targetX: 0, targetY: 0 });
export const EditingRotation = trait({ durableAngle: 0, targetAngle: 0 });
export const EditingScale = trait({ durableX: 1, durableY: 1, targetX: 1, targetY: 1 });
export const EditingColor = trait({ durableFill: '' });

// Tracks which users are editing (non-exclusive)
export const EditedBy = relation();

// Tag: shape is being dragged by a remote user (enables interpolation)
export const IsRemoteDragging = trait();

// Interaction
export const IsSelected = trait(); // Tag
export const IsHovering = trait(); // Tag
export const Dragging = trait({ offsetX: 0, offsetY: 0 });
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
