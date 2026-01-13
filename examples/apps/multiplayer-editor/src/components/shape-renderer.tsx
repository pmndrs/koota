import { useQuery } from 'koota/react';
import { NetID, ShapeType, Position, Rotation, Scale, Color } from '../traits';
import { ShapeView } from './shape-view';

export function ShapeRenderer() {
	const shapes = useQuery(NetID, ShapeType, Position, Rotation, Scale, Color);

	return (
		<>
			{shapes.map((entity) => (
				<ShapeView key={entity.id()} entity={entity} />
			))}
		</>
	);
}
