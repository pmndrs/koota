import { Component as ComponentCore } from '@sweet-ecs/core';
import { useMemo } from 'react';
import { Entity } from '../../entity/entity';
import { domComponents } from './components/components';

export function SweetElement<T extends keyof typeof domComponents>({
	type,
	components = [],
	ref,
	...props
}: { components?: (typeof ComponentCore | ComponentCore)[]; type: T } & JSX.IntrinsicElements[T]) {
	const View = domComponents[type];
	const view = useMemo(() => new View(null!), []);
	const Type = type as unknown as React.FunctionComponent;

	return (
		<Entity components={[...components, view]}>
			<Type
				// @ts-expect-error - ref has to be any here
				ref={(instance) => {
					if (ref && typeof ref === 'function') ref(instance);
					// @ts-expect-error - more ref type issues ???
					else if (ref && 'current' in ref) ref.current = instance;
					if (instance) view.object = instance;
				}}
				{...props}
			/>
		</Entity>
	);
}
