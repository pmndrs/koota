import { useRef, useCallback, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useTrait, useHas } from 'koota/react';
import type { Entity } from 'koota';
import * as THREE from 'three';
import { Position, Color, ShapeType, IsSelected, NetID, ThreeRef } from '../traits';
import { useSyncClient } from '../sync/sync-context';

interface ShapeViewProps {
	entity: Entity;
}

export function ShapeView({ entity }: ShapeViewProps) {
	const syncClient = useSyncClient();

	// Only subscribe to traits that affect rendering (not transform - that's handled by sync system)
	const color = useTrait(entity, Color);
	const shapeType = useTrait(entity, ShapeType);
	const isSelected = useHas(entity, IsSelected);

	// Drag state
	const [isDragging, setIsDragging] = useState(false);
	const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
	const dragOffset = useRef(new THREE.Vector3());
	const gestureId = useRef<string | null>(null);

	// Attach ThreeRef when mesh mounts, remove on unmount
	const handleRef = useCallback(
		(mesh: THREE.Mesh | null) => {
			if (mesh) {
				entity.add(ThreeRef(mesh));
			} else {
				entity.remove(ThreeRef);
			}
		},
		[entity]
	);

	const handlePointerDown = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			e.stopPropagation();
			(e.target as HTMLElement).setPointerCapture?.(e.pointerId);

			const netId = entity.get(NetID)?.id;
			if (!netId) return;

			// Select this shape
			const currentSelection = syncClient.getSelection();
			if (currentSelection !== netId) {
				// Deselect previous
				if (currentSelection) {
					const prevEntity = syncClient.getEntity(currentSelection);
					if (prevEntity?.isAlive()) {
						prevEntity.remove(IsSelected);
					}
				}
				// Select new
				entity.add(IsSelected);
				syncClient.setSelection(netId);
			}

			// Start dragging
			setIsDragging(true);
			gestureId.current = crypto.randomUUID();

			// Calculate drag offset from current position
			const position = entity.get(Position);
			if (e.point && position) {
				dragOffset.current.set(position.x - e.point.x, 0, position.z - e.point.z);
				dragPlane.current.constant = -position.y;
			}
		},
		[entity, syncClient]
	);

	const handlePointerMove = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			if (!isDragging || !e.ray) return;
			e.stopPropagation();

			const netId = entity.get(NetID)?.id;
			if (!netId) return;

			// Intersect with drag plane
			const intersection = new THREE.Vector3();
			if (e.ray.intersectPlane(dragPlane.current, intersection)) {
				const newPos = {
					x: intersection.x + dragOffset.current.x,
					y: -dragPlane.current.constant,
					z: intersection.z + dragOffset.current.z,
				};

				syncClient.dispatch('setPosition', newPos, netId, {
					gestureId: gestureId.current!,
				});
			}
		},
		[isDragging, entity, syncClient]
	);

	const handlePointerUp = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			(e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
			setIsDragging(false);
			gestureId.current = null;
		},
		[]
	);

	if (!color || !shapeType) {
		return null;
	}

	const geometry = getGeometry(shapeType.type);

	return (
		<mesh
			ref={handleRef}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			{geometry}
			<meshStandardMaterial
				color={color.value}
				emissive={isSelected ? '#ffffff' : '#000000'}
				emissiveIntensity={isSelected ? 0.2 : 0}
			/>
			{isSelected && <SelectionOutline />}
		</mesh>
	);
}

function getGeometry(type: string) {
	switch (type) {
		case 'sphere':
			return <sphereGeometry args={[0.5, 32, 32]} />;
		case 'cylinder':
			return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
		case 'box':
		default:
			return <boxGeometry args={[1, 1, 1]} />;
	}
}

function SelectionOutline() {
	return (
		<lineSegments>
			<edgesGeometry args={[new THREE.BoxGeometry(1.05, 1.05, 1.05)]} />
			<lineBasicMaterial color="#ffffff" linewidth={2} />
		</lineSegments>
	);
}
