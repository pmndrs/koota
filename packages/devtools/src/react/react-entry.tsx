import { useEffect, useRef } from 'react';
import type { World } from '@koota/core';
import { Editor } from '../devtools/devtools';

export interface DevtoolsProps {
	world: World;
	defaultPosition?: { x: number; y: number };
	defaultOpen?: boolean;
	editor?: Editor;
}

export function Devtools(props: DevtoolsProps) {
	const cleanupRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		let isMounted = true;

		import('../create-devtools').then(({ createDevtools }) => {
			if (!isMounted) return;

			const instance = createDevtools(props.world, {
				defaultPosition: props.defaultPosition,
				defaultOpen: props.defaultOpen,
				editor: props.editor,
			});
			cleanupRef.current = instance.unmount;
		});

		return () => {
			isMounted = false;
			cleanupRef.current?.();
			cleanupRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return null;
}
