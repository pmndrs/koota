import { createRoot } from 'react-dom/client';
import type { World } from '@koota/core';
import { Devtools, type DevtoolsProps } from './devtools/devtools';

export type CreateDevtoolsOptions = Omit<DevtoolsProps, 'world'>;

export function createDevtools(world: World, options?: CreateDevtoolsOptions) {
	const container = document.createElement('div');
	document.body.appendChild(container);

	const root = createRoot(container);
	root.render(<Devtools world={world} {...options} />);

	return {
		unmount: () => {
			root.unmount();
			container.remove();
		},
	};
}

