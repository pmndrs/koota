import { SweetElement } from './sweet-element';
import { threeComponents } from './components/components';

type SweetElemnets = 'object3D' extends keyof React.JSX.IntrinsicElements
	? {
			[K in keyof typeof threeComponents]: (
				props: Omit<React.ComponentProps<typeof SweetElement<K>>, 'type'>
			) => JSX.Element;
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
	sweet.object3D = (props: any) => <SweetElement type="object3D" {...props} />;
	sweet.skeleton = (props: any) => <SweetElement type="skeleton" {...props} />;
	sweet.batchedMesh = (props: any) => <SweetElement type="batchedMesh" {...props} />;
	sweet.instancedMesh = (props: any) => <SweetElement type="instancedMesh" {...props} />;
	sweet.mesh = (props: any) => <SweetElement type="mesh" {...props} />;
	sweet.group = (props: any) => <SweetElement type="group" {...props} />;
	sweet.bone = (props: any) => <SweetElement type="bone" {...props} />;
	sweet.line = (props: any) => <SweetElement type="line" {...props} />;
	sweet.lineLoop = (props: any) => <SweetElement type="lineLoop" {...props} />;
	sweet.lineSegments = (props: any) => <SweetElement type="lineSegments" {...props} />;
	sweet.lOD = (props: any) => <SweetElement type="lOD" {...props} />;
	sweet.points = (props: any) => <SweetElement type="points" {...props} />;
	sweet.skinnedMesh = (props: any) => <SweetElement type="skinnedMesh" {...props} />;
	sweet.sprite = (props: any) => <SweetElement type="sprite" {...props} />;
}
