import { useActions } from 'koota/react';
import { useCallback, useEffect, useState } from 'react';
import { actions } from '../actions';
import { undoManager } from '../collab/doc';
import { Presence } from './Presence';

const SHAPE_COLORS = ['#4488ff', '#44ff88', '#ff4488', '#ffaa44', '#aa44ff', '#44ffff'];

export function Toolbar() {
	const { spawnShape, deleteShape, getSelectedShapeId, undo, redo, selectShape } =
		useActions(actions);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	useEffect(() => {
		const update = () => {
			setCanUndo(undoManager.canUndo());
			setCanRedo(undoManager.canRedo());
		};

		update();
		undoManager.on('stack-item-added', update);
		undoManager.on('stack-item-popped', update);

		return () => {
			undoManager.off('stack-item-added', update);
			undoManager.off('stack-item-popped', update);
		};
	}, []);

	const handleSpawnBox = useCallback(() => {
		const color = SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)];
		spawnShape('box', color);
	}, [spawnShape]);

	const handleSpawnSphere = useCallback(() => {
		const color = SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)];
		spawnShape('sphere', color);
	}, [spawnShape]);

	const handleSpawnCylinder = useCallback(() => {
		const color = SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)];
		spawnShape('cylinder', color);
	}, [spawnShape]);

	const handleDelete = useCallback(() => {
		const selectedId = getSelectedShapeId();
		if (selectedId) {
			deleteShape(selectedId);
			selectShape(null);
		}
	}, [getSelectedShapeId, deleteShape, selectShape]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Delete' || e.key === 'Backspace') {
				handleDelete();
			} else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
				e.preventDefault();
				undo();
			} else if (
				(e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
				(e.key === 'y' && (e.ctrlKey || e.metaKey))
			) {
				e.preventDefault();
				redo();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleDelete, undo, redo]);

	return (
		<>
			<div style={styles.toolbar}>
				<div style={styles.group}>
					<span style={styles.label}>Add</span>
					<button style={styles.button} onClick={handleSpawnBox} title="Add Box">
						◻
					</button>
					<button style={styles.button} onClick={handleSpawnSphere} title="Add Sphere">
						○
					</button>
					<button style={styles.button} onClick={handleSpawnCylinder} title="Add Cylinder">
						◎
					</button>
				</div>

				<div style={styles.divider} />

				<div style={styles.group}>
					<button style={styles.button} onClick={handleDelete} title="Delete (Del)">
						🗑
					</button>
				</div>

				<div style={styles.divider} />

				<div style={styles.group}>
					<button
						style={{ ...styles.button, opacity: canUndo ? 1 : 0.4 }}
						onClick={undo}
						disabled={!canUndo}
						title="Undo (Ctrl+Z)"
					>
						↩
					</button>
					<button
						style={{ ...styles.button, opacity: canRedo ? 1 : 0.4 }}
						onClick={redo}
						disabled={!canRedo}
						title="Redo (Ctrl+Shift+Z)"
					>
						↪
					</button>
				</div>
			</div>

			<Presence />
		</>
	);
}

const styles: Record<string, React.CSSProperties> = {
	toolbar: {
		position: 'fixed',
		top: 16,
		left: '50%',
		transform: 'translateX(-50%)',
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		padding: '8px 16px',
		background: 'rgba(20, 20, 35, 0.9)',
		borderRadius: 12,
		border: '1px solid rgba(255, 255, 255, 0.1)',
		backdropFilter: 'blur(10px)',
		boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
	},
	group: {
		display: 'flex',
		alignItems: 'center',
		gap: 4,
	},
	label: {
		fontSize: 12,
		color: 'rgba(255, 255, 255, 0.6)',
		marginRight: 4,
		fontFamily: 'inherit',
	},
	button: {
		width: 36,
		height: 36,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: 'rgba(255, 255, 255, 0.1)',
		border: '1px solid rgba(255, 255, 255, 0.15)',
		borderRadius: 8,
		color: '#fff',
		fontSize: 16,
		cursor: 'pointer',
		transition: 'all 0.15s ease',
	},
	divider: {
		width: 1,
		height: 24,
		background: 'rgba(255, 255, 255, 0.15)',
	},
};
