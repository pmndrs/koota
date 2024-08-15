import { createWorld } from '@sweet-ecs/core';
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useInsertionEffect,
	useMemo,
	useRef,
} from 'react';
import { WorldContext } from './world-context';

type Props = {
	size?: number;
	children?: React.ReactNode;
	resources?: Sweet.Component[];
	world?: Sweet.World;
};

export const World = forwardRef<Sweet.World, Props>(function World(
	{ children, resources = [], world: src },
	ref
): React.ReactElement<any, any> {
	const memoizedResources = useRef(resources);
	const world = useMemo(() => src ?? createWorld({ init: false }), [src]);
	useImperativeHandle(ref, () => world);
	const hasSrc = src !== undefined;

	// If we are making the world ourselves, handle init and destroy.
	// Use insertion effect to run before uLE or uE while playing nice with suspense.
	useInsertionEffect(() => {
		if (hasSrc) return;
		if (!world.isInitialized) world.init();

		return () => {
			world.destroy();
		};
	}, [world]);

	// Add world resources.
	useEffect(() => {
		if (!resources) return;
		resources.forEach((resource) => world.resources.add(resource));

		return () => {
			// Only remove resources that are no longer in the list.
			const diff = memoizedResources.current.filter(
				(resource) => !resources.includes(resource)
			);

			diff.forEach((resource) => {
				if (world.resources.has(resource)) world.resources.remove(resource);
			});
		};
	}, [resources]);

	return <WorldContext.Provider value={world}>{children}</WorldContext.Provider>;
});
