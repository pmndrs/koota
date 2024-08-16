import { forwardRef } from 'react';
import { ComponentProp } from '../../component/types';
import { useComponent } from '../../component/use-component';
import { Entity } from '../../entity/entity';
import { domComponents } from './components/components';

type DomKeys = keyof typeof domComponents;

export type KootaElementType<T extends DomKeys> = React.ForwardRefRenderFunction<
	JSX.IntrinsicElements[T],
	{ components?: ComponentProp[]; type: T } & Omit<JSX.IntrinsicElements[T], 'ref'> & {
			ref?: React.Ref<JSX.IntrinsicElements[T]>;
		}
>;

export const KootaElement = forwardRef(function KootaElement<T extends DomKeys>(
	{
		type,
		components = [],
		...props
	}: { components?: ComponentProp[]; type: T } & JSX.IntrinsicElements[T],
	ref: React.Ref<JSX.IntrinsicElements[T]>
) {
	const View = domComponents[type];
	const [view, setView] = useComponent(View);
	const Type = type as unknown as React.FunctionComponent;

	return (
		<Entity components={[...components, view]}>
			<Type
				// @ts-expect-error - ref has to be any here
				ref={(instance) => {
					if (ref && typeof ref === 'function') ref(instance);
					// @ts-expect-error - more ref type issues ???
					else if (ref && 'current' in ref) ref.current = instance;
					if (instance) !view.object && setView({ object: instance } as any, true);
				}}
				{...props}
			/>
		</Entity>
	);
}) as KootaElementType<DomKeys>;
