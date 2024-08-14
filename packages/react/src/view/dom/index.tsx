import { forwardRef } from 'react';
import { domComponents } from './components/components';
import { SweetElement, SweetElementType } from './sweet-element';

type SweetElemnets = 'div' extends keyof React.JSX.IntrinsicElements
	? {
			[K in keyof typeof domComponents]: React.ForwardRefRenderFunction<
				React.ComponentRef<SweetElementType<K>>,
				Omit<React.ComponentProps<SweetElementType<K>>, 'type'>
			>;
	  }
	: Record<string, never>;

let hasReactDom = false;

try {
	await import('react-dom').then(() => {
		hasReactDom = true;
	});
} catch {}

export const sweet = {} as SweetElemnets;

// Hardcode the keys for faster iteration speeds vs computed keys.
// Makes a difference when spawning lots of entities at once.

if (hasReactDom) {
	sweet.div = forwardRef((props: any, ref) => (
		<SweetElement type="div" {...props} ref={ref} />
	)) as any;
}
