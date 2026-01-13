import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export type ShapeData = {
	type: 'box' | 'sphere' | 'cylinder';
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
	color: string;
};

// Create Yjs document
export const ydoc = new Y.Doc();

// Shared map for shapes, keyed by unique ID
export const shapes = ydoc.getMap<ShapeData>('shapes');

// Undo manager scoped to shapes
export const undoManager = new Y.UndoManager(shapes);

// WebSocket provider - connects to local server
// Run: npx y-websocket (in another terminal)
export const provider = new WebsocketProvider(
	'ws://localhost:1234',
	'koota-collab-editor',
	ydoc
);

// Debug logging
console.log('[y-websocket] Provider created, connecting to ws://localhost:1234');

provider.on('status', ({ status }: { status: string }) => {
	console.log('[y-websocket] status:', status);
});

provider.on('sync', (synced: boolean) => {
	console.log('[y-websocket] synced:', synced, 'shapes count:', shapes.size);
});

// Log when shapes change
shapes.observe(() => {
	console.log('[yjs] shapes changed, count:', shapes.size, 'keys:', Array.from(shapes.keys()));
});

// Awareness for presence (selections, cursors)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const awareness: any = provider.awareness;

// Generate unique shape IDs
export function generateShapeId(): string {
	return `shape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
