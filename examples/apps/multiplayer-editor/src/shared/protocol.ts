/**
 * Shared protocol types between client and server.
 */

// Shape data types
export type ShapeTypeValue = 'box' | 'sphere' | 'cylinder';
export type PositionData = { x: number; y: number; z: number };
export type RotationData = { x: number; y: number; z: number; w: number };
export type ScaleData = { x: number; y: number; z: number };

// Op types
export type OpType =
	| 'spawnShape'
	| 'deleteShape'
	| 'setPosition'
	| 'setRotation'
	| 'setScale'
	| 'setColor';

// Op payloads
export interface SpawnShapePayload {
	netId: string;
	shapeType: ShapeTypeValue;
	position: PositionData;
	rotation: RotationData;
	scale: ScaleData;
	color: string;
}

export interface DeleteShapePayload {
	shapeType?: ShapeTypeValue;
	position?: PositionData;
	rotation?: RotationData;
	scale?: ScaleData;
	color?: string;
}

export interface SetPositionPayload extends PositionData {}
export interface SetRotationPayload extends RotationData {}
export interface SetScalePayload extends ScaleData {}
export interface SetColorPayload {
	value: string;
}

export type OpPayload =
	| SpawnShapePayload
	| DeleteShapePayload
	| SetPositionPayload
	| SetRotationPayload
	| SetScalePayload
	| SetColorPayload;

// Op structure
export interface Op<T = OpPayload> {
	id: string;
	type: OpType;
	netId: string;
	payload: T;
	clientSeq: number;
	serverSeq?: number;
	clientId: string;
	timestamp: number;
	gestureId?: string;
}

// Message types
export interface DocOpMessage {
	type: 'op';
	op: Op;
}

export interface SnapshotMessage {
	type: 'snapshot';
	shapes: SpawnShapePayload[];
	serverSeq: number;
}

export interface PresenceMessage {
	type: 'presence';
	clientId: string;
	color: string;
	selectedNetId: string | null;
}

export interface RejectMessage {
	type: 'reject';
	opId: string;
	reason: string;
}

export interface ClientLeftMessage {
	type: 'clientLeft';
	clientId: string;
}

export type ServerMessage =
	| DocOpMessage
	| SnapshotMessage
	| PresenceMessage
	| RejectMessage
	| ClientLeftMessage;

export type ClientMessage = DocOpMessage | PresenceMessage;
