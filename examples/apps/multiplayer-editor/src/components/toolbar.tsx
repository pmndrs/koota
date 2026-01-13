import { useState } from 'react';
import { useTrait, useWorld } from 'koota/react';
import { useSyncClient } from '../sync/sync-context';
import { EditorStatus, type ShapeTypeValue } from '../traits';

export function Toolbar() {
	const world = useWorld();
	const syncClient = useSyncClient();
	const editor = useTrait(world, EditorStatus);
	const [selectedColor, setSelectedColor] = useState('#4a90d9');

	const spawnShape = (shapeType: ShapeTypeValue) => {
		const netId = crypto.randomUUID();
		syncClient.dispatch(
			'spawnShape',
			{
				netId,
				shapeType,
				position: { x: 0, y: 0.5, z: 0 },
				rotation: { x: 0, y: 0, z: 0, w: 1 },
				scale: { x: 1, y: 1, z: 1 },
				color: selectedColor,
			},
			netId
		);
	};

	const deleteSelected = () => {
		const selectedNetId = syncClient.getSelection();
		if (!selectedNetId) return;
		syncClient.dispatch('deleteShape', {}, selectedNetId);
		syncClient.setSelection(null);
	};

	const changeColor = (color: string) => {
		setSelectedColor(color);
		const selectedNetId = syncClient.getSelection();
		if (selectedNetId) {
			syncClient.dispatch('setColor', { value: color }, selectedNetId);
		}
	};

	return (
		<div className="toolbar">
			<button onClick={() => spawnShape('box')}>📦 Box</button>
			<button onClick={() => spawnShape('sphere')}>🔮 Sphere</button>
			<button onClick={() => spawnShape('cylinder')}>🛢️ Cylinder</button>

			<div className="color-picker">
				<input
					type="color"
					value={selectedColor}
					onChange={(e) => changeColor(e.target.value)}
				/>
			</div>

			<button className="danger" onClick={deleteSelected}>
				🗑️ Delete
			</button>

			<div className="undo-redo">
				<button onClick={() => syncClient.undo()} disabled={!editor?.canUndo}>
					↩️
				</button>
				<button onClick={() => syncClient.redo()} disabled={!editor?.canRedo}>
					↪️
				</button>
			</div>
		</div>
	);
}
