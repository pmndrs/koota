import { SweetElement, SweetElementType } from './sweet-element';
import { threeComponents } from './components/components';
import { forwardRef } from 'react';

type SweetElemnets = 'object3D' extends keyof React.JSX.IntrinsicElements
	? {
			[K in keyof typeof threeComponents]: React.ForwardRefRenderFunction<
				React.ComponentRef<SweetElementType<K>>,
				Omit<React.ComponentProps<SweetElementType<K>>, 'type'>
			>;
	  }
	: Record<string, never>;

let hasR3F = false;

try {
	await import('@react-three/fiber').then(() => {
		hasR3F = true;
	});
} catch {}

export const sweet = {} as SweetElemnets;

// Hardcode the keys for faster iteration speeds vs computed keys.
// Makes a difference when spawning lots of entities at once.

if (hasR3F) {
	sweet.object3D = forwardRef((props: any, ref) => (
		<SweetElement type="object3D" {...props} ref={ref} />
	)) as any;
	sweet.skeleton = forwardRef((props: any, ref) => (
		<SweetElement type="skeleton" {...props} ref={ref} />
	)) as any;
	sweet.batchedMesh = forwardRef((props: any, ref) => (
		<SweetElement type="batchedMesh" {...props} ref={ref} />
	)) as any;
	sweet.instancedMesh = forwardRef((props: any, ref) => (
		<SweetElement type="instancedMesh" {...props} ref={ref} />
	)) as any;
	sweet.mesh = forwardRef((props: any, ref) => (
		<SweetElement type="mesh" {...props} ref={ref} />
	)) as any;
	sweet.group = forwardRef((props: any, ref) => (
		<SweetElement type="group" {...props} ref={ref} />
	)) as any;
	sweet.bone = forwardRef((props: any, ref) => (
		<SweetElement type="bone" {...props} ref={ref} />
	)) as any;
	sweet.lineLoop = forwardRef((props: any, ref) => (
		<SweetElement type="lineLoop" {...props} ref={ref} />
	)) as any;
	sweet.lineSegments = forwardRef((props: any, ref) => (
		<SweetElement type="lineSegments" {...props} ref={ref} />
	)) as any;
	sweet.lOD = forwardRef((props: any, ref) => (
		<SweetElement type="lOD" {...props} ref={ref} />
	)) as any;
	sweet.points = forwardRef((props: any, ref) => (
		<SweetElement type="points" {...props} ref={ref} />
	)) as any;
	sweet.skinnedMesh = forwardRef((props: any, ref) => (
		<SweetElement type="skinnedMesh" {...props} ref={ref} />
	)) as any;
	sweet.sprite = forwardRef((props: any, ref) => (
		<SweetElement type="sprite" {...props} ref={ref} />
	)) as any;
}
