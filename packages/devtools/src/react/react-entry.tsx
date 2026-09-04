import type { World } from '@koota/core';
import { useEffect, useRef } from 'react';
import type { Editor } from '../types';

export interface DevtoolsProps {
  world: World;
  defaultPosition?: { x: number; y: number };
  defaultOpen?: boolean;
  editor?: Editor;
}

/**
 * Mounts the devtools panel next to a React app. The panel renders into its
 * own root so it never shares a tree with the host and is loaded lazily to
 * keep it out of the app's initial bundle.
 */
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
    // Only run on mount and unmount, prop changes are ignored
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
