import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { Entity } from 'koota';
import { useQuery, useQueryFirst } from 'koota/react';
import { useCallback, useEffect, useRef } from 'react';
import type { Object3D } from 'three';
import { shapes } from '../collab/doc';
import { Ref, Selected, ShapeColor, ShapeId, ShapeType, Transform } from '../traits/index';
import { ShapeView } from './ShapeView';

export function Scene() {
	return (
		<>
			<color attach="background" args={['#1a1a2e']} />
			<ambientLight intensity={0.4} />
			<directionalLight position={[10, 10, 5]} intensity={0.8} />

			<Grid
				infiniteGrid
				fadeDistance={50}
				fadeStrength={5}
				cellSize={1}
				cellColor="#3a3a5a"
				sectionSize={5}
				sectionColor="#4a4a7a"
			/>

			<OrbitControls makeDefault />

			<ShapesRenderer />
			<SelectedShapeControls />
		</>
	);
}

function ShapesRenderer() {
	const entities = useQuery(ShapeId, ShapeType, ShapeColor, Transform);

	return (
		<>
			{entities.map((entity) => (
				<ShapeView key={entity.id()} entity={entity} />
			))}
		</>
	);
}

function SelectedShapeControls() {
	const selected = useQueryFirst(Selected, Transform, ShapeId);
	const controlsRef = useRef<any>(null);
	const { gl } = useThree();

	const handleChange = useCallback(() => {
		if (!selected || !controlsRef.current) return;

		const object = controlsRef.current.object as Object3D | undefined;
		if (!object) return;

		const shapeId = selected.get(ShapeId)?.id;
		if (!shapeId) return;

		// Update Yjs with new transform
		const current = shapes.get(shapeId);
		if (!current) return;

		shapes.set(shapeId, {
			...current,
			position: [object.position.x, object.position.y, object.position.z],
			rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
			scale: [object.scale.x, object.scale.y, object.scale.z],
		});
	}, [selected]);

	// Get the Object3D ref from the selected entity
	const selectedRef = selected?.get(Ref);

	useEffect(() => {
		if (!controlsRef.current) return;

		const controls = controlsRef.current;
		controls.addEventListener('objectChange', handleChange);

		return () => {
			controls.removeEventListener('objectChange', handleChange);
		};
	}, [handleChange]);

	if (!selected || !selectedRef) return null;

	return (
		<TransformControls
			ref={controlsRef}
			object={selectedRef}
			onMouseDown={() => {
				gl.domElement.style.cursor = 'grabbing';
			}}
			onMouseUp={() => {
				gl.domElement.style.cursor = 'auto';
			}}
		/>
	);
}
