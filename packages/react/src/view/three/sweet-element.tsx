import { Object3DNode, ThreeElements } from '@react-three/fiber';
import React, { forwardRef } from 'react';
import { ComponentProp } from '../../component/types';
import { useComponent } from '../../component/use-component';
import { Entity } from '../../entity/entity';
import { threeComponents } from './components/components';
import * as THREE from 'three';

type ThreeKeys = keyof typeof threeComponents;

type PatchedElements = ThreeElements extends { ['batchedMesh']: any }
	? ThreeElements
	: ThreeElements & { ['batchedMesh']: Object3DNode<THREE.BatchedMesh, typeof THREE.BatchedMesh> };

export type KootaElementType<T extends ThreeKeys> = React.ForwardRefRenderFunction<
	PatchedElements[T],
	{ components?: ComponentProp[]; type: T } & Omit<PatchedElements[T], 'ref'> & {
			ref?: React.Ref<PatchedElements[T]>;
		}
>;

export const KootaElement = forwardRef(function KootaElement<T extends ThreeKeys>(
	{
		type,
		components = [],
		...props
	}: { components?: ComponentProp[]; type: T } & PatchedElements[T],
	ref: React.Ref<PatchedElements[T]>
) {
	const View = threeComponents[type];
	const [view, setView] = useComponent(View);
	const Type = type as unknown as React.FunctionComponent;

	return (
		<Entity components={[...components, view]}>
			<Type
				// @ts-expect-error - ref has to be any here
				ref={(instance) => {
					if (ref && typeof ref === 'function') ref(instance);
					// @ts-expect-error - more ref type issues ???
					else if (ref && 'current' in ref) ref.current = instance;
					if (instance) setView({ object: instance } as any, true);
				}}
				{...props}
			/>
		</Entity>
	);
}) as KootaElementType<ThreeKeys>;
