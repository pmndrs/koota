import { createRoot } from 'react-dom/client';
import type { World } from '@koota/core';
import { Devtools, type DevtoolsProps } from './devtools/devtools';

export type CreateDevtoolsOptions = Omit<DevtoolsProps, 'world' | 'worlds'>;

/**
 * @param worldOrWorlds - A single world (backward compat), an array of worlds, or omitted to auto-discover from the universe.
 */
export function createDevtools(worldOrWorlds?: World | World[], options?: CreateDevtoolsOptions) {
	const container = document.createElement('div');
	document.body.appendChild(container);

	const root = createRoot(container);

	const worlds = worldOrWorlds
		? Array.isArray(worldOrWorlds)
			? worldOrWorlds
			: [worldOrWorlds]
		: undefined;

	root.render(<Devtools worlds={worlds} {...options} />);

	return {
		unmount: () => {
			root.unmount();
			container.remove();
		},
	};
}
