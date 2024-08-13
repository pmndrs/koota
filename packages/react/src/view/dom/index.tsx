import { domComponents } from './components/components';
import { SweetElement } from './sweet-element';

type SweetElemnets = 'div' extends keyof React.JSX.IntrinsicElements
	? {
			[K in keyof typeof domComponents]: (
				props: Omit<React.ComponentProps<typeof SweetElement<K>>, 'type'>
			) => JSX.Element;
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
	sweet.div = (props: any) => <SweetElement type="div" {...props} />;
}
