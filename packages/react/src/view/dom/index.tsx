import { forwardRef } from 'react';
import { domComponents } from './components/components';
import { KootaElement, KootaElementType } from './sweet-element';

type KootaElemnets = 'div' extends keyof React.JSX.IntrinsicElements
	? {
			[K in keyof typeof domComponents]: React.ForwardRefRenderFunction<
				React.ComponentRef<KootaElementType<K>>,
				Omit<React.ComponentProps<KootaElementType<K>>, 'type'>
			>;
	  }
	: Record<string, never>;

let hasReactDom = false;

try {
	await import('react-dom').then(() => {
		hasReactDom = true;
	});
} catch {}

export const koota = {} as KootaElemnets;

// Hardcode the keys for faster iteration speeds vs computed keys.
// Makes a difference when spawning lots of entities at once.

if (hasReactDom) {
	koota.div = forwardRef((props: any, ref) => (
		<KootaElement type="div" {...props} ref={ref} />
	)) as any;
}
