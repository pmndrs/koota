import { useEffect, useRef } from 'react';
import type { World } from '@koota/core';
import type { Editor } from '../types';

export interface DevtoolsProps {
	/** @deprecated Use `worlds` instead. */
	world?: World;
	worlds?: World[];
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

			const worlds = props.worlds ?? (props.world ? [props.world] : undefined);

			const instance = createDevtools(worlds, {
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
