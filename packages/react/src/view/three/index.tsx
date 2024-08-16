import { KootaElement, KootaElementType } from './sweet-element';
import { threeComponents } from './components/components';
import { forwardRef } from 'react';

type KootaElemnets = 'object3D' extends keyof React.JSX.IntrinsicElements
	? {
			[K in keyof typeof threeComponents]: React.ForwardRefRenderFunction<
				React.ComponentRef<KootaElementType<K>>,
				Omit<React.ComponentProps<KootaElementType<K>>, 'type'>
			>;
	  }
	: Record<string, never>;

let hasR3F = false;

try {
	await import('@react-three/fiber').then(() => {
		hasR3F = true;
	});
} catch {}

export const koota = {} as KootaElemnets;

// Hardcode the keys for faster iteration speeds vs computed keys.
// Makes a difference when spawning lots of entities at once.

if (hasR3F) {
	koota.object3D = forwardRef((props: any, ref) => (
		<KootaElement type="object3D" {...props} ref={ref} />
	)) as any;
	koota.skeleton = forwardRef((props: any, ref) => (
		<KootaElement type="skeleton" {...props} ref={ref} />
	)) as any;
	koota.batchedMesh = forwardRef((props: any, ref) => (
		<KootaElement type="batchedMesh" {...props} ref={ref} />
	)) as any;
	koota.instancedMesh = forwardRef((props: any, ref) => (
		<KootaElement type="instancedMesh" {...props} ref={ref} />
	)) as any;
	koota.mesh = forwardRef((props: any, ref) => (
		<KootaElement type="mesh" {...props} ref={ref} />
	)) as any;
	koota.group = forwardRef((props: any, ref) => (
		<KootaElement type="group" {...props} ref={ref} />
	)) as any;
	koota.bone = forwardRef((props: any, ref) => (
		<KootaElement type="bone" {...props} ref={ref} />
	)) as any;
	koota.lineLoop = forwardRef((props: any, ref) => (
		<KootaElement type="lineLoop" {...props} ref={ref} />
	)) as any;
	koota.lineSegments = forwardRef((props: any, ref) => (
		<KootaElement type="lineSegments" {...props} ref={ref} />
	)) as any;
	koota.lOD = forwardRef((props: any, ref) => (
		<KootaElement type="lOD" {...props} ref={ref} />
	)) as any;
	koota.points = forwardRef((props: any, ref) => (
		<KootaElement type="points" {...props} ref={ref} />
	)) as any;
	koota.skinnedMesh = forwardRef((props: any, ref) => (
		<KootaElement type="skinnedMesh" {...props} ref={ref} />
	)) as any;
	koota.sprite = forwardRef((props: any, ref) => (
		<KootaElement type="sprite" {...props} ref={ref} />
	)) as any;
}
