import { createActions } from 'koota';
import { shapes, generateShapeId, undoManager, type ShapeData } from './collab/doc';
import { getEntityByShapeId } from './collab/sync';
import { setSelectedShape } from './collab/presence';
import { Selected, ShapeId } from './traits/index';

export const actions = createActions((world) => ({
	/**
	 * Spawn a new shape at the origin
	 */
	spawnShape: (type: ShapeData['type'] = 'box', color = '#4488ff') => {
		const id = generateShapeId();
		const data: ShapeData = {
			type,
			position: [0, 0.5, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1],
			color,
		};
		shapes.set(id, data);
		return id;
	},

	/**
	 * Delete a shape by ID
	 */
	deleteShape: (id: string) => {
		shapes.delete(id);
	},

	/**
	 * Update a shape's transform in Yjs
	 */
	updateTransform: (
		id: string,
		transform: {
			position?: [number, number, number];
			rotation?: [number, number, number];
			scale?: [number, number, number];
		}
	) => {
		const current = shapes.get(id);
		if (!current) return;

		shapes.set(id, {
			...current,
			position: transform.position ?? current.position,
			rotation: transform.rotation ?? current.rotation,
			scale: transform.scale ?? current.scale,
		});
	},

	/**
	 * Select a shape (local + presence)
	 */
	selectShape: (id: string | null) => {
		// Clear previous selection
		world.query(Selected).forEach((entity) => {
			entity.remove(Selected);
		});

		// Set new selection
		if (id) {
			const entity = getEntityByShapeId(world, id);
			if (entity && entity.isAlive()) {
				entity.add(Selected);
			}
		}

		// Update presence
		setSelectedShape(id);
	},

	/**
	 * Get currently selected shape ID
	 */
	getSelectedShapeId: (): string | null => {
		const selected = world.queryFirst(Selected);
		if (!selected) return null;
		return selected.get(ShapeId)?.id ?? null;
	},

	/**
	 * Undo last action
	 */
	undo: () => {
		undoManager.undo();
	},

	/**
	 * Redo last undone action
	 */
	redo: () => {
		undoManager.redo();
	},
}));
