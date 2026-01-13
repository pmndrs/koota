import { useActions } from 'koota/react';
import type { Entity } from 'koota';
import { useCallback, useMemo, useState, useEffect } from 'react';
import type { Group } from 'three';
import { actions } from '../actions';
import { Ref, Selected, ShapeColor, ShapeId, ShapeType, Transform } from '../traits/index';
import { getRemotePresence, onPresenceChange } from '../collab/presence';

type ShapeViewProps = {
	entity: Entity;
};

export function ShapeView({ entity }: ShapeViewProps) {
	const { selectShape, getSelectedShapeId } = useActions(actions);
	const [hovered, setHovered] = useState(false);

	const shapeId = entity.get(ShapeId)!.id;
	const shapeType = entity.get(ShapeType)!.type;
	const color = entity.get(ShapeColor)!.color;
	const transform = entity.get(Transform)!;
	const isSelected = entity.has(Selected);

	// Check if remote user is selecting this shape
	const [remoteSelectionColor, setRemoteSelectionColor] = useState<string | null>(null);

	useEffect(() => {
		const updateRemoteSelection = () => {
			const remotePresence = getRemotePresence();
			let foundColor: string | null = null;

			remotePresence.forEach((state) => {
				if (state.selectedShapeId === shapeId) {
					foundColor = state.color;
				}
			});

			setRemoteSelectionColor(foundColor);
		};

		updateRemoteSelection();
		return onPresenceChange(updateRemoteSelection);
	}, [shapeId]);

	// Store group ref on entity - this is what TransformControls manipulates
	const handleInit = useCallback(
		(group: Group | null) => {
			if (!entity.isAlive() || !group) return;

			// Copy initial transform to the group
			group.position.copy(transform.position);
			group.rotation.copy(transform.rotation);
			group.scale.copy(transform.scale);

			// Store ref on entity
			entity.add(Ref(group));
		},
		[entity, transform]
	);

	const handleClick = useCallback(
		(e: { stopPropagation: () => void }) => {
			e.stopPropagation();

			// Toggle selection
			const currentSelection = getSelectedShapeId();
			if (currentSelection === shapeId) {
				selectShape(null);
			} else {
				selectShape(shapeId);
			}
		},
		[shapeId, selectShape, getSelectedShapeId]
	);

	const geometry = useMemo(() => {
		switch (shapeType) {
			case 'sphere':
				return <sphereGeometry args={[0.5, 32, 32]} />;
			case 'cylinder':
				return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
			case 'box':
			default:
				return <boxGeometry args={[1, 1, 1]} />;
		}
	}, [shapeType]);

	// Determine outline color
	const outlineColor = isSelected ? '#ffffff' : remoteSelectionColor;
	const showOutline = isSelected || remoteSelectionColor;

	return (
		<group ref={handleInit}>
			{/* Main shape mesh */}
			<mesh
				onClick={handleClick}
				onPointerOver={() => setHovered(true)}
				onPointerOut={() => setHovered(false)}
			>
				{geometry}
				<meshStandardMaterial
					color={hovered ? '#ffffff' : color}
					emissive={hovered ? color : '#000000'}
					emissiveIntensity={hovered ? 0.3 : 0}
				/>
			</mesh>

			{/* Selection outline - child of group so it moves with it */}
			{showOutline && (
				<mesh scale={1.05}>
					{geometry}
					<meshBasicMaterial color={outlineColor!} wireframe />
				</mesh>
			)}
		</group>
	);
}
